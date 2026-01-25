import { BoosterType } from '../types/BlastTypes';

const { ccclass, property } = cc._decorator;

@ccclass
export default class BlastBoostersView extends cc.Component {
    @property
    manualLayout: boolean = false;

    @property
    spacing: number = 220;

    // Количество зарядов бустеров на текущий раунд. Пока что задаём константами здесь,
    // но в будущем можно пробрасывать реальные значения из контроллера.
    @property
    bombCharges: number = 5;

    @property
    teleportCharges: number = 5;

    // Спрайты для оформления UI бустеров (загружаем из assets/resources/imgs/*).
    private boosterBgSpriteFrame: cc.SpriteFrame = null; // фон кнопки бустера (bg_booster.png)
    private slotBgSpriteFrame: cc.SpriteFrame = null;    // фон счётчика (slot_booster.png)
    private bombIconSpriteFrame: cc.SpriteFrame = null;       // иконка бустера-бомбы (icon_booster_bomb.png)
    private teleportIconSpriteFrame: cc.SpriteFrame = null;   // иконка бустера- телепорта (icon_booster_teleport.png)

    @property
    selected: BoosterType = BoosterType.None;

    // Внутренние ссылки на лейблы-счётчики на кнопках бустеров.
    private bombCounterLabel: cc.Label = null;
    private teleportCounterLabel: cc.Label = null;


    @property(cc.Node)
    btnRow: cc.Node = null;

    @property(cc.Node)
    btnCol: cc.Node = null;

    private onSelected: ((b: BoosterType) => void) | null = null;

    onLoad() {
        // Сначала загружаем необходимые спрайты из resources, затем собираем UI.
        this._loadSprites(() => {
            this._ensureUI();
            this.layout();
            this._updateVisual();
        });
    }

    onEnable() {
        cc.view.on('resize', this.layout, this);
    }

    onDisable() {
        cc.view.off('resize', this.layout, this);
    }

    public layout(): void {
        // Пока что лэйаут не делает ничего сложного: нода бустеров растягивается по ширине экрана,
        // а сами кнопки создаются/позиционируются в _ensureUI().
        // Здесь оставляем метод для совместимости и будущего расширения.
    }

    public setOnSelected(fn: (b: BoosterType) => void): void {
        this.onSelected = fn;
    }

    // Обновление количества зарядов для отображения на кнопках.
    public setCharges(bomb: number, teleport: number): void {
        this.bombCharges = bomb;
        this.teleportCharges = teleport;
        this._updateCounters();
    }

    public setSelected(b: BoosterType): void {
        this.selected = b;
        this._updateVisual();
    }

    private _ensureUI(): void {
        if (this.node.width === 0 || this.node.height === 0) {
            this.node.width = 960;
            this.node.height = 120;
        }

        // Try to find buttons by names if not assigned
        if (!this.btnRow) this.btnRow = this.node.getChildByName('Btn_Bomb') || this.node.getChildByName('Btn_Row');
        if (!this.btnCol) this.btnCol = this.node.getChildByName('Btn_Teleport') || this.node.getChildByName('Btn_Col');

        // Fallback: создаём простые кнопки, если в сцене они не заданы.
        if (!this.btnRow) this.btnRow = this._makeBtn('Bomb', cc.v2(-this.node.width / 6, 0));
        if (!this.btnCol) this.btnCol = this._makeBtn('Teleport', cc.v2(this.node.width / 6, 0));

        this.btnRow.width = this.node.width / 3
        this.btnRow.height = this.node.height * 0.7

        this.btnCol.width = this.node.width / 3
        this.btnCol.height = this.node.height * 0.7

        // Применяем графический фон к кнопкам, если спрайт загружен.
        this._applyButtonBackgrounds();
        // Добавляем иконки на кнопки бомбы и телепорта, если спрайты загружены.
        this._applyButtonIcons();

        // После того как кнопки есть, обновляем / создаём на них счётчики.
        this._updateCounters();

        // Ensure handlers attached once
        this.btnRow.off(cc.Node.EventType.TOUCH_END);
        this.btnCol.off(cc.Node.EventType.TOUCH_END);

        // Bomb — радиальный взрыв вокруг выбранной клетки.
        this.btnRow.on(cc.Node.EventType.TOUCH_END, () => this._select(BoosterType.Bomb));
        // Teleport — выбор режима телепорта (перестановка двух тайлов).
        this.btnCol.on(cc.Node.EventType.TOUCH_END, () => this._select(BoosterType.Teleport));
    }

    private _select(b: BoosterType): void {
        this.selected = b;
        this._updateVisual();
        if (this.onSelected) this.onSelected(b);
    }

    private _updateVisual(): void {
        // Подсвечиваем активную кнопку бустера.
        this._setBtnActive(this.btnRow, this.selected === BoosterType.Bomb);
        this._setBtnActive(this.btnCol, this.selected === BoosterType.Teleport);
    }

    // Загружает спрайты bg_booster и slot_booster из assets/resources/imgs/*.
    private _loadSprites(done: () => void): void {
        // Если спрайты уже загружены — ничего не делаем.
        if (this.boosterBgSpriteFrame && this.slotBgSpriteFrame && this.bombIconSpriteFrame && this.teleportIconSpriteFrame) {
            if (done) done();
            return;
        }

        const totalToLoad = 4;
        let loadedCount = 0;

        const finishOne = () => {
            loadedCount++;
            if (loadedCount >= totalToLoad) {
                if (done) done();
            }
        };

        // Фон кнопок бустеров.
        cc.loader.loadRes('imgs/bg_booster', cc.SpriteFrame, (err: Error, spriteFrame: cc.SpriteFrame) => {
            if (err) {
                cc.error('[BlastBoostersView] failed to load imgs/bg_booster', err);
            } else {
                this.boosterBgSpriteFrame = spriteFrame;
            }
            finishOne();
        });

        // Фон слота для счётчика.
        cc.loader.loadRes('imgs/slot_booster', cc.SpriteFrame, (err: Error, spriteFrame: cc.SpriteFrame) => {
            if (err) {
                cc.error('[BlastBoostersView] failed to load imgs/slot_booster', err);
            } else {
                this.slotBgSpriteFrame = spriteFrame;
            }
            finishOne();
        });

        // Иконка бустера-бомбы.
        cc.loader.loadRes('imgs/icon_booster_bomb', cc.SpriteFrame, (err: Error, spriteFrame: cc.SpriteFrame) => {
            if (err) {
                cc.error('[BlastBoostersView] failed to load imgs/icon_booster_bomb', err);
            } else {
                this.bombIconSpriteFrame = spriteFrame;
            }
            finishOne();
        });

        // Иконка бустера-телепорта.
        cc.loader.loadRes('imgs/icon_booster_teleport', cc.SpriteFrame, (err: Error, spriteFrame: cc.SpriteFrame) => {
            if (err) {
                cc.error('[BlastBoostersView] failed to load imgs/icon_booster_teleport', err);
            } else {
                this.teleportIconSpriteFrame = spriteFrame;
            }
            finishOne();
        });
    }

    // Обновляет текстовые счётчики на кнопках бустеров.
    // Для каждой кнопки создаём отдельную дочернюю ноду-контейнер с фоном slot_booster и числом оставшихся зарядов.
    private _updateCounters(): void {
        // ----- Бомба -----
        this.bombCounterLabel = this._ensureCounterForButton(this.btnRow, 'BombCounter', this.bombCounterLabel);
    
        if (this.bombCounterLabel) {
            this.bombCounterLabel.string = String(this.bombCharges);
        }

        // ----- Телепорт -----
        this.teleportCounterLabel = this._ensureCounterForButton(this.btnCol, 'TeleportCounter', this.teleportCounterLabel);
        if (this.teleportCounterLabel) {
            this.teleportCounterLabel.string = String(this.teleportCharges);
        }
    }

    // Создаёт/находит контейнер для счётчика на кнопке: внутри фон slot_booster и Label поверх.
    private _ensureCounterForButton(btn: cc.Node, baseName: string, cachedLabel: cc.Label | null): cc.Label | null {
        if (!btn) return null;

        // Контейнер для счётчика (держит и фон, и текст)
        let container = btn.getChildByName(baseName);
        if (!container) {
            container = new cc.Node(baseName);
            btn.addChild(container, 1); // над фоном кнопки
        }

        // Позиционируем контейнер по центру в нижней части кнопки
        const h = btn.height || 52;
        container.setPosition(0, -btn.height / 2 + 52 + 25);

        // Фон slot_booster
        if (this.slotBgSpriteFrame) {
            let bgNode = container.getChildByName('Bg');
            if (!bgNode) {
                bgNode = new cc.Node('Bg');
                container.addChild(bgNode, 0);
            }
            let sp = bgNode.getComponent(cc.Sprite) || bgNode.addComponent(cc.Sprite);
            sp.spriteFrame = this.slotBgSpriteFrame;
            sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
            sp.type = cc.Sprite.Type.SLICED;
            bgNode.width = btn.width * 0.55;
            bgNode.height = 68 + 20;
            bgNode.setPosition(0, 0);
        }

        // Текстовый Label поверх фона
        let label = cachedLabel;
        if (!label || !label.isValid) {
            let labelNode = container.getChildByName('Label');
            if (!labelNode) {
                labelNode = new cc.Node('Label');
                container.addChild(labelNode, 1);
            }
            labelNode.setPosition(0, 0);

            label = labelNode.getComponent(cc.Label) || labelNode.addComponent(cc.Label);
            label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
            label.verticalAlign = cc.Label.VerticalAlign.CENTER;
            label.fontSize = 48;
            label.lineHeight = 48;
            label.node.color = cc.Color.WHITE;
        }

        return label;
    }

    // Применяет спрайт-фон ко всем кнопкам бустеров.
    private _applyButtonBackgrounds(): void {
        this._applyButtonBackground(this.btnRow);
        this._applyButtonBackground(this.btnCol);
    }

    // Добавляет иконки на кнопки бустеров (бомба и телепорт).
    private _applyButtonIcons(): void {
        this._ensureIconForButton(this.btnRow, this.bombIconSpriteFrame, 'BombIcon');
        this._ensureIconForButton(this.btnCol, this.teleportIconSpriteFrame, 'TeleportIcon');
    }

    private _ensureIconForButton(btn: cc.Node, frame: cc.SpriteFrame, name: string): void {
        if (!btn || !frame) return;

        let iconNode = btn.getChildByName(name);
        if (!iconNode) {
            iconNode = new cc.Node(name);
            btn.addChild(iconNode, 0); // над фоном, под счётчиками
        }

        iconNode.setPosition(0, btn.height * 0.15)

        const sp = iconNode.getComponent(cc.Sprite) || iconNode.addComponent(cc.Sprite);
        sp.spriteFrame = frame;
        sp.sizeMode = cc.Sprite.SizeMode.TRIMMED;
        sp.type = cc.Sprite.Type.SIMPLE;
    }

    // Вешает Sprite с bg_booster на конкретную кнопку.
    private _applyButtonBackground(btn: cc.Node): void {
        if (!btn || !this.boosterBgSpriteFrame) return;

        // Если на кнопке был Graphics — выключаем его, чтобы не мешал спрайтовому фону.
        const g = btn.getComponent(cc.Graphics);
        if (g) {
            g.enabled = false;
        }

        // Фон делаем отдельной дочерней нодой, чтобы не конфликтовать с лейблом и другими компонентами.
        let bgNode = btn.getChildByName('Bg');
        if (!bgNode) {
            bgNode = new cc.Node('Bg');
            btn.addChild(bgNode, -1); // под текстом и счётчиками
        }

        const sp = bgNode.getComponent(cc.Sprite) || bgNode.addComponent(cc.Sprite);
        sp.spriteFrame = this.boosterBgSpriteFrame;
        sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        sp.type = cc.Sprite.Type.SLICED;

        // Размер фона подогнали под кнопку.
        const w = btn.width;
        const h = btn.height;
        bgNode.width = w;
        bgNode.height = h;
        bgNode.setPosition(0, 0);
    }

    private _setBtnActive(btn: cc.Node, active: boolean): void {
        if (!btn) return;

        // If design provides a child named "Selected", toggle it
        const selectedNode = btn.getChildByName('Selected');
        if (selectedNode) {
            selectedNode.active = active;
            btn.opacity = 255;
            return;
        }

        // If there is a Graphics component, redraw (только если он включён).
        const g = btn.getComponent(cc.Graphics);
        if (g && g.enabled) {
            g.clear();
            g.fillColor = active ? new cc.Color(255, 255, 255, 240) : new cc.Color(255, 255, 255, 140);
            g.roundRect(-90, -26, 180, 52, 10);
            g.fill();
        } else {
            // fallback: просто меняем прозрачность кнопки (для спрайтового фона).
            btn.opacity = active ? 255 : 180;
        }

        const lbl = btn.getComponentInChildren(cc.Label);
        // if (lbl) lbl.node.color = active ? cc.Color.BLACK : new cc.Color(40, 40, 40);
    }

    private _makeBtn(text: string, pos: cc.Vec2): cc.Node {
        const btn = new cc.Node('Btn_' + text);
        btn.name = 'Btn_' + text;
        btn.setPosition(pos);
        this.node.addChild(btn);

        const g = btn.addComponent(cc.Graphics);
        g.fillColor = new cc.Color(255, 255, 255, 140);
        g.roundRect(-90, -26, 180, 52, 10);
        g.fill();

        btn.width = 180;
        btn.height = 52;

        const lblNode = new cc.Node('Label');
        // Лейбл по центру кнопки (для fallback-кнопок он тоже станет счётчиком).
        lblNode.setPosition(0, 0);
        btn.addChild(lblNode);

        return btn;
    }
}
