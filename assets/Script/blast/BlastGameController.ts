import {BlastBoardComponent} from './BlastBoardComponent';
import {BlastBoostersView} from './BoostersView/BlastBoostersView';
import {BlastGameLogic} from './BlastGameLogic';
import {BlastHudView} from './HudView/BlastHudView';
import {TileModel} from './types/TileModel';
import { BoosterType, GameConfig } from './types/BlastTypes';
import {exponentialGrowth} from './helpers'

const { ccclass, property } = cc._decorator;

@ccclass
export class BlastGameController extends cc.Component {
    @property
    rows: number = 9;

    @property
    cols: number = 9;

    @property
    colorsCount: number = 5;

    @property
    minGroupSize: number = 2;

    @property
    moves: number = 30;

    @property
    targetScore: number = 20000;

    // Максимальное количество автоматических перемешиваний поля, когда нет ходов.
    @property
    maxReshuffles: number = 3;

    @property
    gap: number = 0;

    @property(cc.SpriteFrame)
    tileSpriteFrame: cc.SpriteFrame = null;

    // Optional: if you have a designed scene/prefab, assign these nodes to avoid auto-creating them.
    @property(cc.Node)
    rootNode: cc.Node = null;

    @property(cc.Node)
    hudNode: cc.Node = null;

    @property(cc.Node)
    boardNode: cc.Node = null;

    @property(cc.Node)
    boostersNode: cc.Node = null;

    private logic: BlastGameLogic = null;

    private hudView: BlastHudView = null;
    private boardView: BlastBoardComponent = null;
    private boostersView: BlastBoostersView = null;

    private inputLocked: boolean = false;
    private gameEnded: boolean = false;
    private selectedBooster: BoosterType = BoosterType.None;

    // Первая выбранная клетка для бустера "телепорт".
    private teleportFirstTile: TileModel | null = null;

    private palette: cc.Color[] = [
        new cc.Color(235, 87, 87),  // red
        new cc.Color(39, 174, 96),  // green
        new cc.Color(45, 156, 219), // blue
        new cc.Color(242, 201, 76), // yellow
        new cc.Color(155, 81, 224), // purple
    ];

    onLoad () {
        // Ensure we are bound to scene graph nodes before starting the game logic.
        if (!this._bindSceneRefs()) {
            return;
        }

        // Position HudRoot, BoardRoot and BoostersRoot according to visual spec.
        this._layoutRoots();

        // Start a new game session.
        this._newGame();
    }

    onEnable () {
        // Re-layout roots on screen resize to keep visual offsets stable.
        cc.view.on('resize', this._layoutRoots, this);
    }

    onDisable () {
        // Remove resize handler when controller is disabled.
        cc.view.off('resize', this._layoutRoots, this);
    }

    private _bindSceneRefs(): boolean {
        const root = this.rootNode || this.node.getChildByName('BlastRoot');
        if (!root) {
            cc.error('[BlastGameController] BlastRoot not found. Create it under Canvas and assign rootNode.');
            return false;
        }

        const hudNode = this.hudNode || root.getChildByName('HudRoot');
        const boardNode = this.boardNode || root.getChildByName('BoardRoot');
        const boostersNode = this.boostersNode || root.getChildByName('BoostersRoot');

        if (!hudNode) {
            cc.error('[BlastGameController] HudRoot not found. Create it under BlastRoot and assign hudNode.');
            return false;
        }
        if (!boardNode) {
            cc.error('[BlastGameController] BoardRoot not found. Create it under BlastRoot and assign boardNode.');
            return false;
        }
        if (!boostersNode) {
            cc.error('[BlastGameController] BoostersRoot not found. Create it under BlastRoot and assign boostersNode.');
            return false;
        }

        this.hudView = hudNode.getComponent(BlastHudView);
        this.boardView = boardNode.getComponent(BlastBoardComponent);
        this.boostersView = boostersNode.getComponent(BlastBoostersView);

        if (!this.hudView) {
            cc.error('[BlastGameController] BlastHudView component is missing on HudRoot.');
            return false;
        }
        if (!this.boardView) {
            cc.error('[BlastGameController] BlastBoardComponent component is missing on BoardRoot.');
            return false;
        }
        if (!this.boostersView) {
            cc.error('[BlastGameController] BlastBoostersView component is missing on BoostersRoot.');
            return false;
        }

        this.hudView.setRestartHandler(() => this._newGame());
        this.boostersView.setOnSelected((b) => {
            this.selectedBooster = b;
        });

        return true;
    }

    private _newGame(): void {
        this.inputLocked = false;
        this.gameEnded = false;
        this.selectedBooster = BoosterType.None;
        this.teleportFirstTile = null; // сбрасываем состояние выбора для телепорта
        if (this.boostersView) this.boostersView.setSelected(BoosterType.None);

        const cfg: GameConfig = {
            rows: this.rows,
            cols: this.cols,
            colorsCount: this.colorsCount,
            minGroupSize: this.minGroupSize,
            moves: this.moves,
            targetScore: this.targetScore,
            maxReshuffles: this.maxReshuffles,
        };

        this.logic = new BlastGameLogic(cfg);

        // Инициализируем значения счётчиков бустеров на панеле.
        if (this.boostersView) {
            this.boostersView.setCharges(
                this.logic.getBombCharges(),
                this.logic.getTeleportCharges(),
            );
        }

        // Bind view to model. BlastBoardComponent сам сделает rebuild() после загрузки спрайтов.
        this.boardView.init({
            board: this.logic.board,
            palette: this.palette,
            gap: this.gap,
            tileSpriteFrame: this.tileSpriteFrame,
            onTileClick: (tile: TileModel) => this._onTileClick(tile),
        });

        // HUD
        this.hudView.hideOverlay();
        this._updateHud();

        if (!this.logic.hasAnyMove()) {
            this._endGame(false, 'No moves');
        }
    }

    private _onTileClick(tile: TileModel): void {
        if (this.inputLocked || this.gameEnded) return;

        const booster = this.selectedBooster;

        // Особый режим для бустера "телепорт" — требуются две клетки.
        if (booster === BoosterType.Teleport) {
            // Если первая клетка ещё не выбрана — запоминаем её и ждём второй клик.
            if (!this.teleportFirstTile) {
                this.teleportFirstTile = tile;
                return;
            }

            // Вторая клетка выбрана — если кликнули по той же, просто снимаем выделение.
            if (this.teleportFirstTile.row === tile.row && this.teleportFirstTile.col === tile.col) {
                this.teleportFirstTile = null;
                return;
            }

            const first = this.teleportFirstTile;
            this.teleportFirstTile = null;

            const outcome = this.logic.teleport(first.row, first.col, tile.row, tile.col);
            if (!outcome.ok || !outcome.step) {
                return;
            }

            // Обновляем счётчики зарядов после телепорта.
            if (this.boostersView) {
                this.boostersView.setCharges(
                    this.logic.getBombCharges(),
                    this.logic.getTeleportCharges(),
                );
            }

            // Телепорт успешно применён — сбрасываем выбранный бустер.
            this.selectedBooster = BoosterType.None;
            if (this.boostersView) this.boostersView.setSelected(BoosterType.None);

            this.inputLocked = true;
            this.boardView.playStep(outcome.step, () => {
                this.inputLocked = false;

                if (outcome.reshuffled) {
                    this.boardView.rebuild();
                }

                this._updateHud();

                if (outcome.ended) {
                    this._endGame(!!outcome.win, outcome.reason || '');
                }
            });

            return;
        }

        // Обычный клик (без бустера или с бомбой).
        const outcome = this.logic.playAt(tile.row, tile.col, booster);
        if (!outcome.ok || !outcome.step) return;

        // Обновляем счётчики зарядов после использования бомбы (или обычного клика, счётчики не изменятся).
        if (this.boostersView) {
            this.boostersView.setCharges(
                this.logic.getBombCharges(),
                this.logic.getTeleportCharges(),
            );
        }

        // Запускаем анимации, зависящие от размера комбо (shake/flash доски и т.п.).
        this._playBoardComboEffects(outcome as any);

        // Спавним частицы на месте каждого удалённого тайла.
        this._spawnTileBurstParticles((outcome as any).removedTiles, outcome.removedCount || 0);

        // Consume booster selection after a successful use
        if (booster !== BoosterType.None) {
            this.selectedBooster = BoosterType.None;
            if (this.boostersView) this.boostersView.setSelected(BoosterType.None);
        }

        this.inputLocked = true;
        this.boardView.playStep(outcome.step, () => {
            this.inputLocked = false;

            if (outcome.reshuffled) {
                this.boardView.rebuild();
            }

            // Логируем агрегированную информацию по удалённым тайлам, чтобы в дальнейшем
            // использовать её для анимаций/эффектов. Добавляем к количеству ещё и человеко-
            // читаемое имя цвета ("red", "green", ...), чтобы в консоли было понятнее.
            if (outcome.removedByColor) {
                const verbose: { [colorIndex: number]: { count: number; name: string | null } } = {};
                for (const key in outcome.removedByColor) {
                    if (!Object.prototype.hasOwnProperty.call(outcome.removedByColor, key)) continue;
                    const colorIndex = parseInt(key, 10);
                    const count = outcome.removedByColor[colorIndex];
                    verbose[colorIndex] = {
                        count,
                        name: this._getColorName(colorIndex),
                    };
                }
            }

            // HUD‑эффекты (пульсация очков, подсветка по доминирующему цвету).
            this._playHudComboEffects(outcome as any);

            this._updateHud();

            if (outcome.ended) {

                this._endGame(!!outcome.win, outcome.reason || '');
            }
        });
    }

    private _endGame(win: boolean, reason: string): void {
        this.gameEnded = true;
        this.inputLocked = true;

        const msg = (win ? 'YOU WIN' : 'YOU LOSE') + '\n' + reason + '\n' +
            'Score: ' + this.logic.score + ' / ' + this.logic.cfg.targetScore;
        this.hudView.showOverlay(msg);
    }

    private _layoutVerticalBlocks(root: cc.Node, blocks: Array<{ node: cc.Node; heightRatio: number }>): void {
        if (!root || !blocks || blocks.length === 0) return;

        const vs = cc.view.getVisibleSize();
        const totalWidth = Math.min(vs.height / 1.7, vs.width);
        const totalHeight = vs.height;

        console.log('vs.width', vs.width)
        console.log('vs.height', vs.height)
        console.log('totalHeight', totalHeight)
        console.log('totalWidth', totalWidth)

        let currentTop = totalHeight / 2;

        for (let i = 0; i < blocks.length; i++) {
            const entry = blocks[i];
            if (!entry || !entry.node) continue;

            const h = totalHeight * entry.heightRatio;
            const node = entry.node;

            // Ширина блока равна ширине root, высота пропорциональна общей высоте.
            node.width = totalWidth;
            node.height = h;

            cc.log('node:', node.name ,  'height:', node.height)

            // Центр блока: текущий верх минус половина высоты.
            node.y = currentTop - h / 2;

            // Смещаемся вниз на высоту блока.
            currentTop -= h;
        }
    }

    private _layoutRoots(): void {
        if (!this.rootNode || !this.hudNode || !this.boardNode || !this.boostersNode) {
            return;
        }

        // Доли высоты для блоков (по высоте корневой ноды):
        const hudRatio = 0.165;       // 16.5% для HUD
        const boostersRatio = 0.235;  // 23.5% для Boosters
        const boardRatio = 1 - hudRatio - boostersRatio; // остаток для Board

        this._layoutVerticalBlocks(this.rootNode, [
            { node: this.hudNode,      heightRatio: hudRatio },
            { node: this.boardNode,    heightRatio: boardRatio },
            { node: this.boostersNode, heightRatio: boostersRatio },
        ]);

        // Перелэйаутим вложенные вью, чтобы они подстроились под новые размеры контейнеров.
        if (this.hudView && (this.hudView as any).layout) {
            this.hudView.layout();
        }
        if (this.boardView && (this.boardView as any).layout) {
            this.boardView.layout();
        }
        if (this.boostersView && (this.boostersView as any).layout) {
            this.boostersView.layout();
        }

    }

    private _updateHud(): void {
        if (!this.logic) return;
        this.hudView.setTarget(this.logic.cfg.targetScore);
        this.hudView.setScore(this.logic.score);
        this.hudView.setMoves(this.logic.movesLeft);
    }

    // Частицы на месте каждого уничтоженного тайла.
    private _spawnTileBurstParticles(
        removedTiles: Array<{ row: number; col: number; color: number }> | undefined,
        removedCount: number,
    ): void {
        if (!removedTiles || removedTiles.length === 0) return;
        if (!this.boardView || !this.boardNode) return;

        // Интенсивность эффекта завязываем на размер комбо.
        const intensity = exponentialGrowth(removedCount, 6)
        const particlesPerTile = intensity;

        const parent = this.boardNode; // рисуем частицы в локальных координатах доски

        for (let t = 0; t < removedTiles.length; t++) {
            const info = removedTiles[t];
            const worldPos = this.boardView.getWorldPositionForCell(info.row, info.col);
            if (!worldPos) continue;
            const localPos = parent.convertToNodeSpaceAR(worldPos);

            for (let i = 0; i < particlesPerTile; i++) {
                const particle = new cc.Node('TileParticle');
                const g = particle.addComponent(cc.Graphics);

                const paletteColor = (this.palette && this.palette.length > 0)
                    ? this.palette[info.color % this.palette.length]
                    : new cc.Color(255, 255, 255);

                const baseRadius = 4;
                const radius = 2 + intensity * 0.55;

                g.clear();
                g.fillColor = paletteColor;
                g.circle(0, 0, radius);
                g.fill();

                particle.opacity = 255;
                particle.setPosition(localPos);
                parent.addChild(particle, 1800);

                // Случайное направление разлёта вокруг тайла.
                const angle = Math.random() * Math.PI * 2;
                const dist = 20 + 40 * intensity * Math.random();
                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist;

                const duration = 0.18 + 0.08 * Math.random();

                cc.tween(particle)
                    .to(duration, {
                        x: localPos.x + dx,
                        y: localPos.y + dy,
                        opacity: 0,
                    }, { easing: 'quadOut' })
                    .call(() => {
                        if (particle.isValid) {
                            particle.destroy();
                        }
                    })
                    .start();
            }
        }
    }

    // Эффекты на доске (shake/flash), зависящие от размера комбо.
    private _playBoardComboEffects(outcome: { removedCount?: number }): void {
        if (!this.boardNode) return;
        const removed = outcome.removedCount || 0;
        if (removed <= 0) return;

        // Нормализуем интенсивность в диапазон 0..1 (12+ тайлов = максимум).
        const intensity = Math.min(1, removed / 12);

        // Лёгкое дрожание доски.
        const shakeAmp = 3 + 7 * intensity;   // 3..10 px
        const shakeTime = 0.18 + 0.06 * intensity; // 0.18..0.24 сек

        const target = this.boardNode;
        const originalPos = target.getPosition();

        cc.Tween.stopAllByTarget(target);

        const seq = cc.tween()
            .to(shakeTime / 4, { x: originalPos.x + shakeAmp })
            .to(shakeTime / 4, { x: originalPos.x - shakeAmp })
            .to(shakeTime / 4, { x: originalPos.x, y: originalPos.y + shakeAmp })
            .to(shakeTime / 4, { x: originalPos.x, y: originalPos.y });

        cc.tween(target)
            .then(seq)
            .call(() => {
                // На всякий случай возвращаем в исходную позицию.
                target.setPosition(originalPos);
            })
            .start();
    }

    // HUD‑эффекты: пульсация счёта и подсветка по доминирующему цвету хода.
    private _playHudComboEffects(outcome: { removedCount?: number; removedByColor?: { [color: number]: number }; removedTiles?: Array<{ row: number; col: number; color: number }> }): void {
        if (!this.hudView) return;
        const removed = outcome.removedCount || 0;
        if (removed <= 0) return;

        const intensity = Math.min(1, removed / 12);

        // Определяем доминирующий цвет по карте removedByColor.
        let dominantColorIndex: number | null = null;
        if (outcome.removedByColor) {
            dominantColorIndex = this._getDominantColorIndex(outcome.removedByColor);
        }

        let pulseColor: cc.Color | null = null;
        if (dominantColorIndex != null && this.palette && this.palette.length > 0) {
            const idx = dominantColorIndex % this.palette.length;
            pulseColor = this.palette[idx];
        }

        // Пульсация счётчика очков.
        this.hudView.playScorePulse(pulseColor, intensity);

        // Летающие орбы из нескольких тайлов к счётчику.
        if (outcome.removedTiles && outcome.removedTiles.length > 0) {
            this._spawnScoreOrbs(outcome.removedTiles, pulseColor, intensity);
        }
    }

    // Спавнит несколько цветных орбов из удалённых тайлов, летящих к HUD‑счётчику.
    private _spawnScoreOrbs(removedTiles: Array<{ row: number; col: number; color: number }>, color: cc.Color | null, intensity: number): void {
        if (!this.boardView || !this.hudView) return;

        const scoreWorldPos = this.hudView.getScoreWorldPosition();
        if (!scoreWorldPos) return;

        const parent = this.node; // общий слой для эффекта между доской и HUD
        const targetLocal = parent.convertToNodeSpaceAR(scoreWorldPos);

        const maxOrbs = 5;
        const count = Math.min(maxOrbs, removedTiles.length);
        if (count <= 0) return;

        const step = removedTiles.length / count;
        for (let i = 0; i < count; i++) {
            const srcIndex = Math.min(removedTiles.length - 1, Math.floor(i * step));
            const info = removedTiles[srcIndex];

            const fromWorld = this.boardView.getWorldPositionForCell(info.row, info.col);
            if (!fromWorld) continue;
            const fromLocal = parent.convertToNodeSpaceAR(fromWorld);

            const orb = new cc.Node('ScoreOrb');
            const g = orb.addComponent(cc.Graphics);

            const baseRadius = 10;
            const radius = baseRadius * (0.8 + 0.4 * intensity);

            const paletteColor = (this.palette && this.palette.length > 0)
                ? this.palette[info.color % this.palette.length]
                : new cc.Color(255, 255, 255);
            const orbColor = color || paletteColor;

            g.clear();
            g.fillColor = orbColor;
            g.circle(0, 0, radius);
            g.fill();

            orb.opacity = 0;
            orb.setPosition(fromLocal);
            parent.addChild(orb, 2000);

            const travelTime = 0.35 + 0.12 * intensity;
            const delay = 0.02 * i;

            cc.tween(orb)
                .delay(delay)
                .to(0.06, { opacity: 255 })
                .to(travelTime, { x: targetLocal.x, y: targetLocal.y, opacity: 0 }, { easing: 'quadInOut' })
                .call(() => {
                    if (orb.isValid) {
                        orb.destroy();
                    }
                })
                .start();
        }
    }

    private _getDominantColorIndex(map: { [color: number]: number }): number | null {
        let bestColor: number | null = null;
        let bestCount = 0;
        for (const key in map) {
            if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
            const colorIndex = parseInt(key, 10);
            const count = map[key];
            if (count > bestCount) {
                bestCount = count;
                bestColor = colorIndex;
            }
        }
        return bestColor;
    }

    // Имя цвета по индексу (используем ту же семантику, что и в palette: red, green, blue, yellow, purple).
    private _getColorName(colorIndex: number): string | null {
        const names = ['red', 'green', 'blue', 'yellow', 'purple'];
        if (names.length === 0) return null;
        const idx = ((colorIndex % names.length) + names.length) % names.length;
        return names[colorIndex];
    }
}


