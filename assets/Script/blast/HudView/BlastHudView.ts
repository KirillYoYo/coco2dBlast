const { ccclass, property } = cc._decorator;
import { BaseComponent } from '../BaseComponent'

@ccclass
export class BlastHudView extends BaseComponent {

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

    // Короткая пульсация счётчика очков. Цвет можно подсветить под доминирующий цвет хода.
    public playScorePulse(color: cc.Color | null, intensity: number): void {
        if (!this.lblScoreValue) return;

        const node = this.lblScoreValue.node;
        const baseScale = node.scale;
        const maxExtra = 0.18; // максимальное увеличение масштаба при больших комбо
        const extra = maxExtra * Math.min(1, Math.max(0.2, intensity));
        const targetScale = baseScale * (1 + extra);

        const originalColor = node.color.clone();
        const pulseColor = color || originalColor;

        cc.Tween.stopAllByTarget(node);

        node.color = pulseColor;
        node.scale = baseScale;

        cc.tween(node)
            .to(0.08, { scale: targetScale })
            .to(0.12, { scale: baseScale })
            .call(() => {
                node.color = originalColor;
            })
            .start();
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

        if (this.panelSpriteFrame) {
            const sp = p.getComponent(cc.Sprite) || p.addComponent(cc.Sprite);
            sp.sizeMode = cc.Sprite.SizeMode.RAW;
            sp.type = cc.Sprite.Type.SLICED;
            sp.spriteFrame = this.panelSpriteFrame;
        }

        p.height = Math.max(50, this.node.height)
        p.width = Math.max(50, this.node.width);
        p.setPosition(0, 0)
    }

    private _renderMovesBlockLayout(): void {
        if (!this.movesPanel) return;

        const movesH = this.panel.height * 0.75;
        const movesW = movesH;

        this.movesPanel.width = movesW;
        this.movesPanel.height = movesH;
        this.movesPanel.anchorX = 0.5
        this.movesPanel.anchorY = 0.5
        this.movesPanel.setPosition(-this.panel.width / 2 + movesW / 2 + 30, 5);


        this._applyMovesPanelBackground(this.movesPanel, this.movesPanelSpriteFrame, movesW, movesH);

        if (!this.lblMovesValue) {
            const n = this.movesPanel.getChildByName('LblMovesValue');
            this.lblMovesValue = n ? n.getComponent(cc.Label) : null;
        }
        if (!this.lblMovesValue) {
            this.lblMovesValue = this._makeLabel(this.movesPanel, '0', cc.v2(0, 0), 40);
            this.lblMovesValue.node.name = 'LblMovesValue';
        }

        this.lblMovesValue.node.getComponent(cc.Label).fontSize = this.setFontSize(80)
        this.lblMovesValue.node.getComponent(cc.Label).lineHeight = this.setFontSize(82)

        this.lblMovesValue.node.setPosition(0, 0);


        this._applyMovesText();
    }

    private _renderScoreBlockLayout(): void {
        if (!this.panel) return;

        let spNode = this.scoresPanel;
        if (!spNode) {
            spNode = this.panel.getChildByName('ScoresPanel');
            if (!spNode) {
                spNode = new cc.Node('ScoresPanel');
                this.panel.addChild(spNode);
            }
            this.scoresPanel = spNode;
        }

        spNode.width = this.panel.width * 0.6;
        spNode.height = Math.max(10, this.panel.height * 0.7);
        spNode.anchorX = 0.5
        spNode.anchorY = 0.5
        spNode.setPosition(spNode.width / 4, 5);

        if (this.scoresSpriteFrame) {
            const sp = spNode.getComponent(cc.Sprite) || spNode.addComponent(cc.Sprite);
            sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
            sp.type = cc.Sprite.Type.SIMPLE;
            sp.spriteFrame = this.scoresSpriteFrame;
        }

        if (!this.lblScoreTitle) {
            let n = spNode.getChildByName('LblScoreTitle');
            if (!n) {
                n = this.panel.getChildByName('LblScoreTitle');
            }
            this.lblScoreTitle = n ? n.getComponent(cc.Label) : null;
        }
        if (!this.lblScoreTitle) {
            this.lblScoreTitle = this._makeLabel(spNode, 'Очки:', cc.v2(0, spNode.height / 2), this.setFontSize(28));
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
            this.lblScoreValue = this._makeLabel(spNode, '0/0', cc.v2(0, 0), this.setFontSize(24));
            this.lblScoreValue.node.name = 'LblScoreValue';
        }

        this.lblScoreTitle.node.parent = spNode;
        this.lblScoreTitle.node.setPosition(0, spNode.height / 4);
        // this.lblScoreTitle.node.height = 52
        this.lblScoreTitle.node.getComponent(cc.Label).fontSize = this.setFontSize(50)
        this.lblScoreTitle.node.getComponent(cc.Label).lineHeight = this.setFontSize(52)

        this.lblScoreValue.node.parent = spNode;
        this.lblScoreValue.node.getComponent(cc.Label).fontSize = this.setFontSize(70)
        this.lblScoreValue.node.getComponent(cc.Label).lineHeight = this.setFontSize(72)
        this.lblScoreValue.node.setPosition(0, spNode.height / 4 -this.setFontSize(70));

        this._applyScoreText();
    }

    private _layoutOverlay(): void {
        if (!this.overlay) return;


        const vs = cc.view.getVisibleSize();
        this.overlay.setPosition(0, 0);
        this.overlay.width = vs.width;
        this.overlay.height = vs.height;
        this.overlay.zIndex = 20;


        let background = this.overlay.getChildByName('overlay_background');
        if (!background) {
            background = new cc.Node('overlay_background');

            background = new cc.Node('overlay_background');
            const graphics = background.addComponent(cc.Graphics);
            graphics.fillColor = cc.color(0, 0, 0, 177);
            graphics.rect(-10000, -10000, 20000, 20000);
            graphics.fill();

            this.overlay.addChild(background);
        }

        background.width = vs.width;
        background.height = vs.height;
        background.setPosition(0, 0);

        let labelNode = this.overlay.getChildByName('overlayLabel');
        if (!labelNode) {
            labelNode = new cc.Node('overlayLabel');
            const label = labelNode.addComponent(cc.Label);
            this.overlayLabel = label

            label.fontSize = this.setFontSize(48);
            label.lineHeight = this.setFontSize(48);
            label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
            label.verticalAlign = cc.Label.VerticalAlign.CENTER;
            label.overflow = cc.Label.Overflow.SHRINK;

            labelNode.color = cc.Color.WHITE;

            this.overlay.addChild(labelNode);
        }

        labelNode.width = this.panel.width;
        labelNode.height = 500;
        labelNode.setPosition(0, 0);


        const label = labelNode.getComponent(cc.Label);
        labelNode.zIndex = 999999
        if (label) {
            label.fontSize = this.setFontSize(48);
            label.lineHeight = label.fontSize + 8;
        }

        let buttonNode = this.overlay.getChildByName('restartButton');
        if (!buttonNode) {
            buttonNode = new cc.Node('restartButton');

            buttonNode.setContentSize(160, 80);

            const graphics = buttonNode.addComponent(cc.Graphics);

            const redrawGraphics = () => {
                graphics.clear();
                const width = buttonNode.width;
                const height = buttonNode.height;

                graphics.roundRect(-width / 2, -height / 2, width, height, 12);
                graphics.fillColor = cc.color(80, 80, 80);
                graphics.fill();
                graphics.strokeColor = cc.Color.WHITE;
                graphics.lineWidth = 2;
                graphics.stroke();
            };

            const button = buttonNode.addComponent(cc.Button);

            const btnLabel = buttonNode.addComponent(cc.Label);
            btnLabel.string = 'ПЕРЕЗАПУСТИТЬ';
            btnLabel.fontSize = this.setFontSize(78);
            btnLabel.lineHeight = this.setFontSize(84);
            btnLabel.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
            btnLabel.verticalAlign = cc.Label.VerticalAlign.CENTER;
            btnLabel.node.color = cc.Color.WHITE;
            buttonNode.on('click', this.onRestart, this);

            this.overlay.addChild(buttonNode);

            this.scheduleOnce(() => {
                if (graphics && graphics.isValid) {
                    redrawGraphics();
                }
            }, 0);

            this.scheduleOnce(() => {
                if (graphics && graphics.isValid) {
                    redrawGraphics();
                }
            }, 0.1);
        }

        buttonNode.setPosition(0, -150);
        buttonNode.zIndex = 100;
        if (!this.overlay.active) {
            this.overlay.active = true;
        }
        if (this.overlay.opacity === 0) {
            this.overlay.opacity = 255;
        }


        const button = buttonNode.getComponent(cc.Button);
        button.transition = cc.Button.Transition.COLOR;
        button.normalColor = cc.color(255, 255, 255, 255);
        button.pressedColor = cc.color(200, 200, 200, 255);
        button.hoverColor = cc.color(240, 240, 240, 255);
    }

    public getScoreWorldPosition(): cc.Vec2 | null {
        if (!this.lblScoreValue) return null;
        return this.lblScoreValue.node.convertToWorldSpaceAR(cc.v2(0, 0));
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
        l.fontSize = this.setFontSize(fontSize);
        l.lineHeight = this.setFontSize(fontSize) + 4;
        l.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        l.verticalAlign = cc.Label.VerticalAlign.CENTER;

        return l;
    }
}
