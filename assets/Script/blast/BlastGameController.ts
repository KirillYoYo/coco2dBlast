import BlastBoardComponent from './BlastBoardComponent';
import BlastBoostersView from './BoostersView/BlastBoostersView';
import BlastGameLogic from './BlastGameLogic';
import BlastHudView from './HudView/BlastHudView';
import TileModel from './types/TileModel';
import { BoosterType, GameConfig } from './types/BlastTypes';

const { ccclass, property } = cc._decorator;

@ccclass
export default class BlastGameController extends cc.Component {
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
            // использовать её для анимаций/эффектов.
            if (outcome.removedByColor) {
                cc.log('Removed by color:', outcome.removedByColor);
            }

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

    // Универсальный метод для раскладки вертикальных блоков внутри корневой ноды.
    // Каждый блок получает ширину root.width и высоту = heightRatio * totalHeight, блоки выкладываются сверху вниз.
    private _layoutVerticalBlocks(root: cc.Node, blocks: Array<{ node: cc.Node; heightRatio: number }>): void {
        if (!root || !blocks || blocks.length === 0) return;

        const vs = cc.view.getVisibleSize();
        const totalWidth = root.width > 0 ? root.width : vs.width;
        const totalHeight = root.height > 0 ? root.height : vs.height;

        let currentTop = totalHeight / 2; // верхняя граница в локальных координатах root

        for (let i = 0; i < blocks.length; i++) {
            const entry = blocks[i];
            if (!entry || !entry.node) continue;

            const h = totalHeight * entry.heightRatio;
            const node = entry.node;

            // Ширина блока равна ширине root, высота пропорциональна общей высоте.
            node.width = totalHeight > 0 ? totalWidth : node.width;
            node.height = h;

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

        this.boardNode.y += 45;

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
}
