const { ccclass, property } = cc._decorator;

@ccclass
export default class BlastHudView extends cc.Component {

    @property(cc.Node)
    panel: cc.Node = null;

    @property(cc.SpriteFrame)
    panelSpriteFrame: cc.SpriteFrame = null;

    @property(cc.Node)
    movesPanel: cc.Node = null;

    @property({ type: cc.SpriteFrame, displayName: 'Moves Background' })
    movesPanelSpriteFrame: cc.SpriteFrame = null;

    @property(cc.Label)
    lblMovesValue: cc.Label = null;

    @property(cc.Label)
    lblScoreTitle: cc.Label = null;

    @property(cc.Label)
    lblScoreValue: cc.Label = null;

    // Overlay (win/lose)
    @property(cc.Node)
    overlay: cc.Node = null;

    @property(cc.Label)
    overlayLabel: cc.Label = null;

    @property(cc.Node)
    scoresPanel: cc.Node = null;

    @property(cc.SpriteFrame)
    scoresSpriteFrame: cc.SpriteFrame = null;

    private onRestart: (() => void) | null = null;

    private currentScore: number = 0;
    private targetScore: number = 0;
    private movesLeft: number = 0;

    private _isEnsuringUI: boolean = false;

    onLoad() {
        this.hideOverlay();
        this.layout();
    }

    onEnable() {
        cc.view.on('resize', this.layout, this);
    }

    onDisable() {
        cc.view.off('resize', this.layout, this);
    }

    public setRestartHandler(fn: () => void): void {
        this.onRestart = fn;
    }

    public setTarget(target: number): void {
        this.targetScore = target;
        this._applyScoreText();
    }

    public setScore(score: number): void {
        this.currentScore = score;
        this._applyScoreText();
    }

    public setMoves(movesLeft: number): void {
        this.movesLeft = movesLeft;
        this._applyMovesText();
    }

    public showOverlay(message: string): void {
        if (this.overlay) this.overlay.active = true;
        if (this.overlayLabel) this.overlayLabel.string = message;
    }

    public hideOverlay(): void {
        if (this.overlay) this.overlay.active = false;
    }

    public layout(): void {
        this._renderHudBlock();
        this._renderMovesBlockLayout();
        this._renderScoreBlockLayout();
        this._layoutOverlay();

    }

    private _renderHudBlock(): void {
        if (!this.panel || !this.movesPanel) {
            return;
        }


        const p = this.panel;
        const minWidth = 580;
        const maxWidth = 870;
        const vs = cc.view.getVisibleSize();
        const screenWidth = vs.width;
        const targetWidth = Math.max(minWidth, Math.min(maxWidth, screenWidth * 0.8));
        const panelHeight = this.node.height;
        p.width = targetWidth;
        p.height = panelHeight;

        // Use sprite background if provided (e.g. bg_frame_moves), otherwise fall back to Graphics.
        if (this.panelSpriteFrame) {
            // Либо берём существующий Sprite, либо добавляем новый.
            const sp = p.getComponent(cc.Sprite) || p.addComponent(cc.Sprite);
            sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
            sp.type = cc.Sprite.Type.SLICED;
            sp.spriteFrame = this.panelSpriteFrame;

            p.width = targetWidth;
            p.height = panelHeight;
        }
    }

    private _renderMovesBlockLayout(): void {
        // Positions labels inside the left moves block.
        if (!this.movesPanel) return;

        const pad = 14;
        const movesH = this.node.height * 0.7;
        const movesW = movesH;

        // Size and position of the left "moves" block within the HUD panel.
        this.movesPanel.width = movesW;
        this.movesPanel.height = movesH;
        this.movesPanel.setPosition(-this.panel.width / 2 + movesW / 1.2, 20);

        // Apply optional background sprite to the moves panel (bg_moves etc.).
        this._applyMovesPanelBackground(this.movesPanel, this.movesPanelSpriteFrame, movesW, movesH);

        // Ensure moves label exists: try to reuse from scene or create a new one under movesPanel.
        if (!this.lblMovesValue) {
            const n = this.movesPanel.getChildByName('LblMovesValue');
            this.lblMovesValue = n ? n.getComponent(cc.Label) : null;
        }
        if (!this.lblMovesValue) {
            this.lblMovesValue = this._makeLabel(this.movesPanel, '0', cc.v2(0, 0), 40);
            this.lblMovesValue.node.name = 'LblMovesValue';
        }

        this.lblMovesValue.node.getComponent(cc.Label).fontSize = 80
        this.lblMovesValue.node.getComponent(cc.Label).lineHeight = 82

        this.lblMovesValue.node.setPosition(0, 0);
        

        // Apply current moves value text.
        this._applyMovesText();
    }

    private _renderScoreBlockLayout(): void {
        if (!this.panel) return;

        const pad = 14;
    

        // Если есть отдельная нода под scoresPanel — используем её, иначе создаём.
        let spNode = this.scoresPanel;
        if (!spNode) {
            spNode = this.panel.getChildByName('ScoresPanel');
            if (!spNode) {
                spNode = new cc.Node('ScoresPanel');
                this.panel.addChild(spNode);
            }
            this.scoresPanel = spNode;
        }

        spNode.width = this.panel.width / 1.65;
        spNode.height = this.panel.height * 0.68;
        spNode.setPosition(this.panel.width / 2 - spNode.width / 1.6, 15);

        // Фон для scoresPanel, если задан spriteFrame.
        if (this.scoresSpriteFrame) {
            const sp = spNode.getComponent(cc.Sprite) || spNode.addComponent(cc.Sprite);
            sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
            sp.type = cc.Sprite.Type.SLICED;
            sp.spriteFrame = this.scoresSpriteFrame;
        }

        // Обеспечиваем наличие лейблов: пробуем найти существующие, иначе создаём под scoresPanel.
        if (!this.lblScoreTitle) {
            let n = spNode.getChildByName('LblScoreTitle');
            if (!n) {
                n = this.panel.getChildByName('LblScoreTitle');
            }
            this.lblScoreTitle = n ? n.getComponent(cc.Label) : null;
        }
        if (!this.lblScoreTitle) {
            this.lblScoreTitle = this._makeLabel(spNode, 'Очки:', cc.v2(0, spNode.height / 2 - 24), 28);
            this.lblScoreTitle.node.name = 'LblScoreTitle';
        }

        if (!this.lblScoreValue) {
            let n = spNode.getChildByName('LblScoreValue');
            if (!n) {
                n = this.panel.getChildByName('LblScoreValue');
            }
            this.lblScoreValue = n ? n.getComponent(cc.Label) : null;
        }
        if (!this.lblScoreValue) {
            this.lblScoreValue = this._makeLabel(spNode, '0/0', cc.v2(0, 0), 24);
            this.lblScoreValue.node.name = 'LblScoreValue';
        }

        // Лейблы должны быть дочерними scoresPanel и позиционироваться относительно неё.
        this.lblScoreTitle.node.parent = spNode;
        this.lblScoreTitle.node.setPosition(0, spNode.height / 4);
        this.lblScoreTitle.node.height = 52
        this.lblScoreTitle.node.getComponent(cc.Label).fontSize = 50
        this.lblScoreTitle.node.getComponent(cc.Label).lineHeight = 52

        this.lblScoreValue.node.parent = spNode;
        this.lblScoreValue.node.getComponent(cc.Label).fontSize = 70
        this.lblScoreValue.node.getComponent(cc.Label).lineHeight = 72
        this.lblScoreValue.node.setPosition(0, -24);

        // Обновляем текст согласно текущему состоянию счёта.
        this._applyScoreText();
    }

    private _layoutOverlay(): void {
        // Overlay should cover the whole screen (HudRoot is usually full-screen).
        if (!this.overlay) return;

        const vs = cc.view.getVisibleSize();
        this.overlay.setPosition(0, 0);
        this.overlay.width = vs.width;
        this.overlay.height = vs.height;
    }

    private _applyMovesText(): void {
        if (this.lblMovesValue) this.lblMovesValue.string = '' + this.movesLeft;
    }

    private _applyScoreText(): void {
        const remaining = Math.max(this.targetScore - this.currentScore, 0);
        if (this.lblScoreTitle) this.lblScoreTitle.string = 'Очки:';
        if (this.lblScoreValue) this.lblScoreValue.string = this.currentScore + '/' + remaining;
    }

    private _applyMovesPanelBackground(panel: cc.Node | null, spriteFrame: cc.SpriteFrame | null, width: number, height: number): void {
        if (!panel || !spriteFrame) {
            return;
        }

        const gap = 24
        if (width > 0) panel.width = width;
        if (height > 0) panel.height = height;

        const sp = panel.getComponent(cc.Sprite) || panel.addComponent(cc.Sprite);
        sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        sp.type = cc.Sprite.Type.SIMPLE;
        sp.spriteFrame = spriteFrame;
    }

    private _makeLabel(parent: cc.Node, text: string, pos: cc.Vec2, fontSize: number): cc.Label {
        const n = new cc.Node('Label');
        n.setPosition(pos);
        parent.addChild(n);

        const l = n.addComponent(cc.Label);
        l.string = text;
        l.fontSize = fontSize;
        l.lineHeight = fontSize + 4;
        l.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        l.verticalAlign = cc.Label.VerticalAlign.CENTER;

        return l;
    }
}
