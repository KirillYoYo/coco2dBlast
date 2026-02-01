import {BoardModel} from './types/BoardModel';
import {BlastBoardView} from './BoardView/BlastBoardView';
import {TileModel} from './types/TileModel';
import { BlastStep } from './types/BlastTypes';

const { ccclass, property } = cc._decorator;

@ccclass
export class BlastBoardComponent extends cc.Component {
    @property
    manualLayout: boolean = false;

    @property
    gap: number = 0;

    @property
    padding: number = 20;

    // If true, and no custom background is provided, the component will draw a simple bg.
    @property
    drawFallbackBackground: boolean = true;

    // Optional references from editor
    @property(cc.Node)
    tilesRoot: cc.Node = null;

    @property(cc.SpriteFrame)
    tileSpriteFrame: cc.SpriteFrame = null;

    // Спрайт фона для всей доски (задаётся в инспекторе).
    @property(cc.SpriteFrame)
    boardBackgroundSprite: cc.SpriteFrame = null;

    private tileSprites: cc.SpriteFrame[] = [];

    private board: BoardModel = null;
    private view: BlastBoardView = null;

    private palette: cc.Color[] = [];
    private onTileClick: ((tile: TileModel) => void) | null = null;


    onLoad () {
        if (this.node.width === 0 || this.node.height === 0) {
            // Адаптивный дефолт: если размеры не заданы в сцене,
            // занимаем ~75% видимого экрана по ширине и высоте.
            const vs = cc.view.getVisibleSize();
            this.node.width = vs.width * 0.75;
            this.node.height = vs.height * 0.75;
        }

        this._ensureNodes();
        this.layout();
    }

    onEnable () {
        cc.view.on('resize', this.layout, this);
    }

    onDisable () {
        cc.view.off('resize', this.layout, this);
    }

    public 
    layout(): void {
        this._ensureNodes();

        if (!this.manualLayout) {
            if (this.tilesRoot) {
                this.tilesRoot.width = this.node.width - this.padding * 2;
                this.tilesRoot.height = this.node.height - this.padding * 2;
                this.tilesRoot.setPosition(0, 0);
            }
        }
    }

    public init(opts: {
        board: BoardModel;
        palette: cc.Color[];
        gap: number;
        tileSpriteFrame?: cc.SpriteFrame | null;
        onTileClick: (tile: TileModel) => void;
    }): void {
        this.board = opts.board;
        this.palette = opts.palette;
        this.gap = opts.gap;
        this.tileSpriteFrame = opts.tileSpriteFrame || null;
        this.onTileClick = opts.onTileClick;

        this._ensureNodes();
        this.layout();

        this._loadTileSprites(() => {
            this.view = new BlastBoardView({
                parent: this.tilesRoot,
                board: this.board,
                gap: this.gap,
                palette: this.palette,
                tileSpriteFrame: this.tileSpriteFrame,
                tileSprites: this.tileSprites,
                backgroundSpriteFrame: this.boardBackgroundSprite, // фон доски
                drawFallbackBackground: this.drawFallbackBackground, // если спрайта нет
                onTileClick: (tile: TileModel) => {
                    if (this.onTileClick) this.onTileClick(tile);
                },
            });
            this.view.rebuild();
        });
    }

    public rebuild(): void {
        if (!this.view) return;
        this.view.rebuild();
    }

    // Мировая позиция клетки (row, col) на доске — используется для полёта эффектов к HUD.
    public getWorldPositionForCell(row: number, col: number): cc.Vec2 | null {
        if (!this.view) return null;
        return this.view.getWorldPositionForCell(row, col);
    }

    public playStep(step: BlastStep, done: () => void): void {
        if (!this.view) {
            done();
            return;
        }
        this.view.playStep(step, done);
    }

    private _ensureNodes(): void {
        // tilesRoot container: нода, в которой рисуются все тайлы.
        if (!this.tilesRoot) {
            this.tilesRoot = this.node.getChildByName('Tiles');
        }
        if (!this.tilesRoot) {
            this.tilesRoot = new cc.Node('Tiles');
            this.node.addChild(this.tilesRoot);
        }
    }

    // Загружает спрайты тайлов из ресурсов (resources/imgs/*.png) по цветам.
    private _loadTileSprites(done: () => void): void {
        // ВАЖНО: файлы должны лежать в assets/resources/imgs/
        // и называться так же, как здесь (без расширения):
        const names = [
            'block_red',
            'block_green',
            'block_blue',
            'block_yellow',
            'block_purpure',
        ];

        const paths = names.map(n => `imgs/${n}`);

        const loaded: cc.SpriteFrame[] = new Array(paths.length);
        let remaining = paths.length;

        if (remaining === 0) {
            this.tileSprites = [];
            done();
            return;
        }

        paths.forEach((path, index) => {
            // Для совместимости с версией движка используем cc.loader.loadRes.
            cc.loader.loadRes(path, cc.SpriteFrame, (err: Error, spriteFrame: cc.SpriteFrame) => {
                if (err) {
                    cc.error('[BlastBoardComponent] Failed to load tile sprite', path, err);
                    // Продолжаем попытки загрузки остальных, но в итоге всё равно вызываем done().
                } else {
                    loaded[index] = spriteFrame;
                }

                remaining--;
                if (remaining === 0) {
                    // Фильтруем возможные undefined, если какие-то ресурсы не загрузились.
                    this.tileSprites = loaded.filter(sf => !!sf);
                    done();
                }
            });
        });
    }
}
