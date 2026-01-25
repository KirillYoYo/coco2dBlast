export default class TileModel {
    public readonly id: number;
    public color: number;
    public row: number;
    public col: number;

    constructor(id: number, color: number, row: number, col: number) {
        this.id = id;
        this.color = color;
        this.row = row;
        this.col = col;
    }
}
