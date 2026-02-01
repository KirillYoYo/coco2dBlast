const { ccclass } = cc._decorator;

/**
 * Базовый класс для компонентов
 */
@ccclass
export class BaseComponent extends cc.Component {
    private vs: cc.Size

    constructor() {
        super();
        this.vs = cc.view.getVisibleSize();
    }

    public setFontSize (size: number) {
        const vs = cc.view.getVisibleSize();

        let newSize = size
    
        if (vs.width < 800) {
            newSize = size * 0.8
        }
        if (vs.width < 500) {
            newSize = size * 0.5
        }

        return newSize
    }

    public setWidth (size: number) {
        return this.vs.width * (size / 1080) 
    }

    public setHeight (size: number) {
        return this.vs.height * (size / 1920) 
    }

    public
}