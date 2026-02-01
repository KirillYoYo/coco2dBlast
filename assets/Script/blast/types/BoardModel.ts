import {TileModel} from './TileModel';
import { BlastStep, BoardConfig, GridPos } from './BlastTypes';

export class BoardModel {
    public readonly rows: number;
    public readonly cols: number;
    public readonly colorsCount: number;

    private _nextId: number = 1;
    private _grid: Array<Array<TileModel | null>> = [];

    constructor(cfg: BoardConfig) {
        this.rows = cfg.rows;
        this.cols = cfg.cols;
        this.colorsCount = cfg.colorsCount;
        this.reset();
    }

    public reset(): void {
        this._grid = [];
        for (let r = 0; r < this.rows; r++) {
            const row: Array<TileModel | null> = [];
            for (let c = 0; c < this.cols; c++) {
                row.push(this._createTile(r, c));
            }
            this._grid.push(row);
        }
    }

    public getTile(r: number, c: number): TileModel | null {
        if (!this._inBounds(r, c)) return null;
        return this._grid[r][c];
    }

    public blastAt(r: number, c: number, minGroupSize: number): { group: TileModel[]; step: BlastStep } | null {
        const group = this.findGroup(r, c);
        if (group.length < minGroupSize) return null;
        const step = this._blastGroup(group);
        return { group, step };
    }

    // Обобщённый метод, который меняет местами два тайла и формирует BlastStep только с "moved".
    // Используется бустером "телепорт".
    public swapTiles(a: GridPos, b: GridPos): BlastStep | null {
        if (!this._inBounds(a.r, a.c) || !this._inBounds(b.r, b.c)) {
            return null;
        }

        const t1 = this._grid[a.r][a.c];
        const t2 = this._grid[b.r][b.c];
        if (!t1 || !t2) {
            return null;
        }

        // Сохраняем исходные позиции для формирования шага анимации.
        const fromA: GridPos = { r: t1.row, c: t1.col };
        const fromB: GridPos = { r: t2.row, c: t2.col };

        // Меняем тайлы местами в сетке.
        this._grid[a.r][a.c] = t2;
        this._grid[b.r][b.c] = t1;

        // Обновляем координаты в моделях.
        t1.row = b.r;
        t1.col = b.c;
        t2.row = a.r;
        t2.col = a.c;

        const moved: Array<{ id: number; move: { from: GridPos; to: GridPos } }> = [
            { id: t1.id, move: { from: fromA, to: { r: t1.row, c: t1.col } } },
            { id: t2.id, move: { from: fromB, to: { r: t2.row, c: t2.col } } },
        ];

        return {
            removed: [],
            moved,
            spawned: [],
        };
    }

    // Used for boosters (row/col clear, etc.)
    public blastPositions(positions: GridPos[]): { tiles: TileModel[]; step: BlastStep } | null {
        const tiles: TileModel[] = [];
        const seen: { [k: string]: boolean } = {};

        for (let i = 0; i < positions.length; i++) {
            const p = positions[i];
            const key = p.r + ',' + p.c;
            if (seen[key]) continue;
            seen[key] = true;
            const t = this.getTile(p.r, p.c);
            if (t) tiles.push(t);
        }

        if (tiles.length === 0) return null;
        const step = this._blastGroup(tiles);
        return { tiles, step };
    }

    public findGroup(r: number, c: number): TileModel[] {
        const start = this.getTile(r, c);
        if (!start) return [];

        const visited: boolean[][] = [];
        for (let i = 0; i < this.rows; i++) {
            visited[i] = [];
            for (let j = 0; j < this.cols; j++) visited[i][j] = false;
        }

        const color = start.color;
        const stack: GridPos[] = [{ r, c }];
        visited[r][c] = true;

        const out: TileModel[] = [];
        while (stack.length) {
            const p = stack.pop();
            const t = this.getTile(p.r, p.c);
            if (!t) continue;
            if (t.color !== color) continue;
            out.push(t);

            const neigh: GridPos[] = [
                { r: p.r - 1, c: p.c },
                { r: p.r + 1, c: p.c },
                { r: p.r, c: p.c - 1 },
                { r: p.r, c: p.c + 1 },
            ];

            for (let k = 0; k < neigh.length; k++) {
                const n = neigh[k];
                if (!this._inBounds(n.r, n.c)) continue;
                if (visited[n.r][n.c]) continue;
                const nt = this._grid[n.r][n.c];
                if (!nt) continue;
                if (nt.color !== color) continue;
                visited[n.r][n.c] = true;
                stack.push(n);
            }
        }

        return out;
    }

    // Fast check for minGroupSize == 2: any equal adjacent pair means a valid move exists.
    public hasAnyMove(minGroupSize: number): boolean {
        if (minGroupSize <= 1) return true;
        if (minGroupSize === 2) {
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const t = this._grid[r][c];
                    if (!t) continue;
                    const right = c + 1 < this.cols ? this._grid[r][c + 1] : null;
                    const down = r + 1 < this.rows ? this._grid[r + 1][c] : null;
                    if (right && right.color === t.color) return true;
                    if (down && down.color === t.color) return true;
                }
            }
            return false;
        }

        // Generic (slower) check: flood fill from each unvisited cell.
        const visited: boolean[][] = [];
        for (let i = 0; i < this.rows; i++) {
            visited[i] = [];
            for (let j = 0; j < this.cols; j++) visited[i][j] = false;
        }

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (visited[r][c]) continue;
                const t = this._grid[r][c];
                if (!t) continue;
                const group = this.findGroup(r, c);
                for (let i = 0; i < group.length; i++) {
                    visited[group[i].row][group[i].col] = true;
                }
                if (group.length >= minGroupSize) return true;
            }
        }

        return false;
    }

    // Перемешивание только цветов на существующих тайлах, без изменения их позиций и id.
    // Используется для автоматического reshuffle, когда нет доступных ходов.
    public shuffleColors(): void {
        const colors: number[] = [];

        // Собираем все цвета с поля в один плоский массив.
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const tile = this._grid[r][c];
                if (!tile) continue;
                colors.push(tile.color);
            }
        }

        // Если тайлов нет, делать нечего.
        if (colors.length === 0) {
            return;
        }

        // Классический алгоритм Фишера–Йетса для равномерного перемешивания.
        for (let i = colors.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = colors[i];
            colors[i] = colors[j];
            colors[j] = tmp;
        }

        // Записываем новые цвета обратно в сетку, сохраняя позиции и id тайлов.
        let idx = 0;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const tile = this._grid[r][c];
                if (!tile) continue;
                tile.color = colors[idx++];
            }
        }
    }

    private _blastGroup(group: TileModel[]): BlastStep {
        const removedIds: number[] = [];
        for (let i = 0; i < group.length; i++) {
            const t = group[i];
            removedIds.push(t.id);
            this._grid[t.row][t.col] = null;
        }

        const moved: Array<{ id: number; move: { from: GridPos; to: GridPos } }> = [];
        const spawned: Array<{ id: number; to: GridPos }> = [];

        for (let c = 0; c < this.cols; c++) {
            let writeRow = this.rows - 1;
            for (let readRow = this.rows - 1; readRow >= 0; readRow--) {
                const tile = this._grid[readRow][c];
                if (!tile) continue;
                if (readRow !== writeRow) {
                    const from = { r: readRow, c };
                    const to = { r: writeRow, c };
                    moved.push({ id: tile.id, move: { from, to } });
                    this._grid[writeRow][c] = tile;
                    this._grid[readRow][c] = null;
                    tile.row = writeRow;
                    tile.col = c;
                }
                writeRow--;
            }

            for (let r = writeRow; r >= 0; r--) {
                const tile = this._createTile(r, c);
                this._grid[r][c] = tile;
                spawned.push({ id: tile.id, to: { r, c } });
            }
        }

        return { removed: removedIds, moved, spawned };
    }

    private _createTile(r: number, c: number): TileModel {
        const color = Math.floor(Math.random() * this.colorsCount);
        return new TileModel(this._nextId++, color, r, c);
    }

    private _inBounds(r: number, c: number): boolean {
        return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
    }
}
