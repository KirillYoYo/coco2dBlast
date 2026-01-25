import BoardModel from '../types/BoardModel';
import TileModel from '../types/TileModel';
import { BlastStep, GridPos } from '../types/BlastTypes';

export default class BlastBoardView {
    private readonly parent: cc.Node;
    private readonly board: BoardModel;

    private readonly gap: number;
    private readonly palette: cc.Color[];
    private readonly tileSpriteFrame: cc.SpriteFrame | null;
    private readonly tileSprites: cc.SpriteFrame[] | null;

    // Спрайт для фона доски и флаг "рисовать ли запасной фон".
    private readonly backgroundSpriteFrame: cc.SpriteFrame | null;
    private readonly drawFallbackBackground: boolean;

    // Нода фона, созданная во вью (если используется спрайт).
    private backgroundNode: cc.Node | null = null;


    private tileWidth: number = 48;
    private tileHeight: number = 48;
    // Vertical overlap between rows (so upper row slightly "overlaps" lower one).
    private verticalOverlap: number = 0;

    private nodesById: { [id: number]: cc.Node } = {};

    private onTileClick: (tile: TileModel) => void;

    constructor(opts: {
        parent: cc.Node;
        board: BoardModel;
        gap: number;
        palette: cc.Color[];
        tileSpriteFrame?: cc.SpriteFrame | null;
        tileSprites?: cc.SpriteFrame[] | null;
        backgroundSpriteFrame?: cc.SpriteFrame | null;
        drawFallbackBackground?: boolean;
        onTileClick: (tile: TileModel) => void;
    }) {
        this.parent = opts.parent;
        this.board = opts.board;
        this.gap = opts.gap;
        this.palette = opts.palette;
        this.tileSpriteFrame = opts.tileSpriteFrame || null;
        this.tileSprites = opts.tileSprites || null;
        this.backgroundSpriteFrame = opts.backgroundSpriteFrame || null;
        this.drawFallbackBackground = opts.drawFallbackBackground !== undefined
            ? opts.drawFallbackBackground
            : true; // по умолчанию рисуем запасной фон
        this.onTileClick = opts.onTileClick;
    }

    public rebuild(): void {
        // Удаляем только тайловые ноды, не трогая фон.
        const children = this.parent.children.slice();
        for (const child of children) {
            if (this.backgroundNode && child === this.backgroundNode) continue;
            child.destroy();
        }
        this.nodesById = {};

        this._recomputeTileSize();
        this._ensureBackground();

        for (let r = 0; r < this.board.rows; r++) {
            for (let c = 0; c < this.board.cols; c++) {
                const tile = this.board.getTile(r, c);
                if (!tile) continue;
                const node = this._createTileNode(tile);
                node.setPosition(this._cellToPos(r, c));
                this.parent.addChild(node);
                this.nodesById[tile.id] = node;
            }
        }
    }

    public playStep(step: BlastStep, done: () => void): void {
        const removeDur = 0.12;
        const fallDur = 0.18;

        // 1) remove
        for (let i = 0; i < step.removed.length; i++) {
            const id = step.removed[i];
            const node = this.nodesById[id];
            if (!node) continue;
            node.off(cc.Node.EventType.TOUCH_END);
            cc.tween(node)
                .parallel(
                    cc.tween().to(removeDur, { scale: 0.2 }),
                    cc.tween().to(removeDur, { opacity: 0 })
                )
                .call(() => {
                    if (node && node.isValid) node.destroy();
                    delete this.nodesById[id];
                })
                .start();
        }

        // 2) moves + spawns (start after remove animation)
        this.parent.runAction(
            cc.sequence(
                cc.delayTime(removeDur),
                cc.callFunc(() => {
                    let pending = 0;
                    const finishOne = () => {
                        pending--;
                        if (pending <= 0) done();
                    };

                    // moved existing tiles
                    for (let i = 0; i < step.moved.length; i++) {
                        const m = step.moved[i];
                        const node = this.nodesById[m.id];
                        if (!node) continue;
                        pending++;
                        const toPos = this._cellToPos(m.move.to.r, m.move.to.c);
                        cc.tween(node)
                            .to(fallDur, { x: toPos.x, y: toPos.y }, { easing: 'quadIn' })
                            .call(finishOne)
                            .start();
                    }

                    // spawned new tiles
                    for (let i = 0; i < step.spawned.length; i++) {
                        const s = step.spawned[i];
                        const tile = this._findTileById(s.id);
                        if (!tile) continue;

                        const node = this._createTileNode(tile);
                        const startPos = this._spawnPosAbove(s.to);
                        const endPos = this._cellToPos(s.to.r, s.to.c);
                        node.setPosition(startPos);
                        node.opacity = 0;
                        this.parent.addChild(node);
                        this.nodesById[s.id] = node;

                        pending++;
                        cc.tween(node)
                            .parallel(
                                cc.tween().to(fallDur, { x: endPos.x, y: endPos.y }, { easing: 'quadIn' }),
                                cc.tween().to(0.08, { opacity: 255 })
                            )
                            .call(finishOne)
                            .start();
                    }

                    if (pending === 0) done();
                })
            )
        );
    }

    private _findTileById(id: number): TileModel | null {
        // Since BoardModel doesn't keep an id->tile map, we scan (small board: OK)
        for (let r = 0; r < this.board.rows; r++) {
            for (let c = 0; c < this.board.cols; c++) {
                const t = this.board.getTile(r, c);
                if (t && t.id === id) return t;
            }
        }
        return null;
    }

    private _createTileNode(tile: TileModel): cc.Node {
        const node = new cc.Node('tile_' + tile.id);
        node.width = this.tileWidth;
        node.height = this.tileHeight;
        node.opacity = 255;

        // Visuals: сначала выбираем нужный спрайт, если он есть.
        let spriteFrame: cc.SpriteFrame | null = null;
        if (this.tileSpriteFrame) {
            // Один общий спрайт для всех тайлов (старое поведение / резерв).
            spriteFrame = this.tileSpriteFrame;
        } else if (this.tileSprites && this.tileSprites.length > 0) {
            // Отдельные спрайты по цвету тайла.
            const idx = tile.color % this.tileSprites.length;
            spriteFrame = this.tileSprites[idx] || null;
        }

        if (spriteFrame) {
            const sp = node.addComponent(cc.Sprite);
            sp.spriteFrame = spriteFrame;
            // Подгоняем картинку под размер тайла с сохранением пропорций.
            const originalSize = spriteFrame.getOriginalSize();
            if (originalSize && originalSize.width > 0 && originalSize.height > 0) {
                const sx = this.tileWidth / originalSize.width;
                const sy = this.tileHeight / originalSize.height;
                const s = Math.min(sx, sy);
                node.width = originalSize.width * s;
                node.height = originalSize.height * s;
            }
            // Используем размер ноды, чтобы можно было управлять ей из layout.
            sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
            // Важно: НЕ красим спрайт через palette, чтобы не искажать цвета картинки.
            node.color = cc.Color.WHITE;
        } else {
            // Фолбэк: рисуем простой цветной прямоугольник через Graphics,
            // если для этого цвета нет спрайта. Цвет берём из palette.
            const g = node.addComponent(cc.Graphics);
            const paletteIndex = this.palette.length > 0
                ? tile.color % this.palette.length
                : 0;
            const fillColor = this.palette[paletteIndex] || cc.Color.WHITE;

            g.clear();
            g.fillColor = fillColor;

            const w = this.tileWidth;
            const h = this.tileHeight;
            const radius = Math.min(w, h) * 0.12; // небольшое скругление углов
            g.roundRect(-w / 2, -h / 2, w, h, radius);
            g.fill();
        }

        // Input: обработчик клика должен вешаться всегда, независимо от того, есть спрайт или нет.
        node.on(cc.Node.EventType.TOUCH_END, () => {
            if (this.onTileClick) this.onTileClick(tile);
        });

        return node;
    }

    private _recomputeTileSize(): void {
        const w = this.parent.width;
        const h = this.parent.height;
        const cols = this.board.cols;
        const rows = this.board.rows;

        // Base design-time tile metrics (at scale 1.0).
        const baseTileWidth = 100;   // px
        const baseTileHeight = 112;  // px
        const baseOverlap = 12;      // px that upper row overlaps lower row vertically

        // Horizontal constraint: board should fit into parent width.
        // w ≈ cols * tileWidth + (cols - 1) * gap
        const sW = (w - this.gap * (cols - 1)) / (cols * baseTileWidth);

        // Vertical constraint: taking into account that rows are packed with overlap.
        // Effective vertical pitch per row (except the first) is (tileHeight - overlap) + gap.
        // Total board height H_board(s) = baseTileHeight*s + (rows - 1) * ((baseTileHeight - baseOverlap)*s + gap).
        const numeratorH = h - this.gap * (rows - 1);
        const denomH = baseTileHeight + (rows - 1) * (baseTileHeight - baseOverlap);
        const sH = numeratorH / denomH;

        let scale = Math.min(1, sW, sH);
        if (!isFinite(scale) || scale <= 0) {
            scale = 0.1;
        }

        this.tileWidth = baseTileWidth * scale;
        this.tileHeight = baseTileHeight * scale;
        this.verticalOverlap = baseOverlap * scale;
    }

    private _cellToPos(r: number, c: number): cc.Vec2 {
        // (0,0) top-left in grid in logical row/col coordinates.
        // Horizontal step uses full tile width, vertical step uses tileHeight minus overlap.
        const stepX = this.tileWidth + this.gap;
        const stepY = (this.tileHeight - this.verticalOverlap) + this.gap;

        const originX = -((this.board.cols - 1) * stepX) / 2;
        const originY = ((this.board.rows - 1) * stepY) / 2;

        const x = originX + c * stepX;
        const y = originY - r * stepY;
        return cc.v2(x, y);
    }

    private _spawnPosAbove(to: GridPos): cc.Vec2 {
        const p = this._cellToPos(to.r, to.c);
        const stepY = (this.tileHeight - this.verticalOverlap) + this.gap;
        // Spawn sufficiently above the board so tiles can fall down with animation.
        return cc.v2(p.x, p.y + stepY * (this.board.rows * 0.6));
    }

    // Создаёт/обновляет фон доски: либо спрайт, либо простой Graphics,
    // в зависимости от настроек.
    private _ensureBackground(): void {
        // Если есть нода фона — просто подгоняем её под размер контейнера.
        if (this.backgroundNode && this.backgroundNode.isValid) {
            this.backgroundNode.width = this.tileWidth * 9;
            this.backgroundNode.height = this.tileHeight * 9;
            this.backgroundNode.setPosition(0, 0);

            return;
        }

        // Если задан спрайт — создаём отдельную ноду с Sprite.
        if (this.backgroundSpriteFrame) {
            const bgNode = new cc.Node('BoardBackground');
            const sp = bgNode.addComponent(cc.Sprite);
            sp.spriteFrame = this.backgroundSpriteFrame;
            sp.sizeMode = cc.Sprite.SizeMode.CUSTOM; // размер управляется через ноду
            sp.type = cc.Sprite.Type.SLICED;

            bgNode.width = this.tileWidth * 10;
            bgNode.height = this.tileHeight * 9 + 80;
            bgNode.setPosition(0, 0);

            // Добавляем под тайлами (zIndex < 0), чтобы фон не перекрывал блоки.
            this.parent.addChild(bgNode, -1);
            this.backgroundNode = bgNode;
            return;
        }

        // Если спрайта нет, но надо нарисовать запасной фон — рисуем через Graphics на parent.
        if (this.drawFallbackBackground) {
            let g = this.parent.getComponent(cc.Graphics);
            if (!g) {
                g = this.parent.addComponent(cc.Graphics);
            }
            g.clear();
            g.fillColor = new cc.Color(20, 24, 30);
            g.roundRect(-this.parent.width / 2, -this.parent.height / 2,
                this.parent.width, this.parent.height, 16);
            g.fill();
        }
    }
}
