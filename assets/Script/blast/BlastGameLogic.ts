import BoardModel from './types/BoardModel';
import TileModel from './types/TileModel';
import { BlastStep, BoosterType, GameConfig, GridPos, RemovedByColor, RemovedTileInfo } from './types/BlastTypes';

export interface MoveOutcome {
    ok: boolean;
    step?: BlastStep;
    removedCount?: number;
    scoreDelta?: number;
    movesLeft?: number;
    score?: number;
    ended?: boolean;
    win?: boolean;
    reason?: string;
    // Было ли выполнено автоматическое перемешивание после хода.
    reshuffled?: boolean;
    // Сколько перемешиваний ещё осталось на эту партию.
    reshufflesLeft?: number;
    // Детальная информация об удалённых тайлах за этот ход.
    removedTiles?: RemovedTileInfo[];
    removedByColor?: RemovedByColor;
}

export default class BlastGameLogic {
    public readonly cfg: GameConfig;
    public readonly board: BoardModel;

    public movesLeft: number;
    public score: number;

    // Количество оставшихся зарядов бустеров на текущую партию.
    private bombBoosterCharges: number;      // заряды бомбы
    private teleportBoosterCharges: number;  // заряды телепорта

    // Радиус действия бомбы по клеткам (максимальное смещение по r/c от центра).
    private bombRadius: number;

    // Сколько автоматических перемешиваний ещё можно сделать, когда нет доступных ходов.
    private reshufflesLeft: number;

    constructor(cfg: GameConfig) {
        this.cfg = cfg;
        this.board = new BoardModel({ rows: cfg.rows, cols: cfg.cols, colorsCount: cfg.colorsCount });
        this.movesLeft = cfg.moves;
        this.score = 0;

        // Настраиваем базовые параметры бустеров. Если значения не переданы в конфиге,
        // по умолчанию даём по 5 зарядов на бустер за партию и радиус бомбы = 1 клетка.
        this.bombBoosterCharges = cfg.bombBoosterCharges != null ? cfg.bombBoosterCharges : 5;
        this.teleportBoosterCharges = cfg.teleportBoosterCharges != null ? cfg.teleportBoosterCharges : 5;
        this.bombRadius = cfg.bombRadius != null ? cfg.bombRadius : 1;

        // Лимит автоматических reshuffle: берём из конфига или по умолчанию 3.
        this.reshufflesLeft = cfg.maxReshuffles != null ? cfg.maxReshuffles : 3;
    }

    // Текущее количество зарядов бустеров — используется для отображения на UI.
    public getBombCharges(): number {
        return this.bombBoosterCharges;
    }

    public getTeleportCharges(): number {
        return this.teleportBoosterCharges;
    }

    public reset(): void {
        this.board.reset();
        this.movesLeft = this.cfg.moves;
        this.score = 0;

        // Сбрасываем лимит reshuffle для новой партии.
        this.reshufflesLeft = this.cfg.maxReshuffles != null ? this.cfg.maxReshuffles : 3;

        // При полном рестарте партии также можно было бы восстановить заряды бустеров,
        // но сейчас рестарт происходит через создание нового BlastGameLogic, поэтому
        // здесь оставляем только сброс счёта, ходов и лимита reshuffle.
    }

    public hasAnyMove(): boolean {
        return this.board.hasAnyMove(this.cfg.minGroupSize);
    }

    public playAt(r: number, c: number, booster: BoosterType): MoveOutcome {
        if (this.movesLeft <= 0) {
            return { ok: false, ended: true, win: false, reason: 'No moves left' };
        }

        // Обработка бустера "бомба": радиальный взрыв вокруг клетки (r, c).
        if (booster === BoosterType.Bomb) {
            return this._boosterBomb(r, c);
        }

        // Обычный ход без бустера — кликаем по группе и взрываем её.
        const res = this.board.blastAt(r, c, this.cfg.minGroupSize);
        if (!res) return { ok: false };

        // Собираем подробную информацию об удалённых тайлах для анимаций/статистики.
        const removedInfo = this._buildRemovedInfo(res.group);
        return this._applyStep(res.group.length, res.step, removedInfo);
    }

    // Бустер "бомба" — сжигает все тайлы в квадрате (Chebyshev-радиус) вокруг клетки (r, c).
    private _boosterBomb(r: number, c: number): MoveOutcome {
        // Если закончились заряды бомбы — ход невалиден.
        if (this.bombBoosterCharges <= 0) {
            return { ok: false };
        }

        const positions: GridPos[] = [];
        const radius = this.bombRadius;

        for (let rr = r - radius; rr <= r + radius; rr++) {
            for (let cc = c - radius; cc <= c + radius; cc++) {
                positions.push({ r: rr, c: cc });
            }
        }

        const res = this.board.blastPositions(positions);
        if (!res) {
            return { ok: false };
        }

        // Собираем информацию об удалённых тайлах от бомбы.
        const removedInfo = this._buildRemovedInfo(res.tiles);

        // Успешное применение бомбы — уменьшаем количество зарядов.
        this.bombBoosterCharges -= 1;
        return this._applyStep(res.tiles.length, res.step, removedInfo);
    }

    // Бустер "телепорт" — меняет местами два тайла без мгновенного взрыва.
    // Возвращаем BlastStep только с полем moved; removedCount = 0, очки не начисляются,
    // но при этом расходуем и ход, и заряд телепорта.
    public teleport(aRow: number, aCol: number, bRow: number, bCol: number): MoveOutcome {
        if (this.movesLeft <= 0) {
            return { ok: false, ended: true, win: false, reason: 'No moves left' };
        }

        if (this.teleportBoosterCharges <= 0) {
            return { ok: false };
        }

        const step = this.board.swapTiles({ r: aRow, c: aCol }, { r: bRow, c: bCol });
        if (!step) {
            return { ok: false };
        }

        // Успешный телепорт — тратим заряд и один ход.
        this.teleportBoosterCharges -= 1;
        return this._applyStep(0, step);
    }

    private _applyStep(removedCount: number, step: BlastStep, removedInfo?: { list: RemovedTileInfo[]; byColor: RemovedByColor }): MoveOutcome {
        this.movesLeft -= 1;
        const scoreDelta = this._calcScore(removedCount);
        this.score += scoreDelta;

        const end = this._checkEndAndMaybeReshuffle();

        return {
            ok: true,
            step,
            removedCount,
            scoreDelta,
            movesLeft: this.movesLeft,
            score: this.score,
            ended: end.ended,
            win: end.win,
            reason: end.reason,
            reshuffled: end.reshuffled,
            reshufflesLeft: this.reshufflesLeft,
            removedTiles: removedInfo ? removedInfo.list : undefined,
            removedByColor: removedInfo ? removedInfo.byColor : undefined,
        };
    }

    private _calcScore(removedCount: number): number {
        // Простая квадратичная формула подсчёта очков за количество взорванных тайлов.
        return 10 * removedCount * removedCount;
    }

    // Проверяем окончание игры и при необходимости пытаемся автоматически перемешать поле.
    private _checkEndAndMaybeReshuffle(): { ended: boolean; win: boolean; reason: string; reshuffled: boolean } {
        // Победа по достижению целевого количества очков.
        if (this.score >= this.cfg.targetScore) {
            return { ended: true, win: true, reason: 'Target reached', reshuffled: false };
        }

        // Проигрыш по исчерпанию ходов.
        if (this.movesLeft <= 0) {
            return { ended: true, win: false, reason: 'No moves left', reshuffled: false };
        }

        // Если вообще нет возможных ходов — пробуем автоматически перемешать поле до лимита.
        if (!this.hasAnyMove()) {
            const reshuffled = this._tryReshuffleUntilHasMove();
            if (!reshuffled) {
                // Лимит reshuffle исчерпан и ходов всё ещё нет — финальный проигрыш.
                return { ended: true, win: false, reason: 'No moves', reshuffled: false };
            }

            // Удалось получить доступные ходы после reshuffle — игра продолжается.
            return { ended: false, win: false, reason: '', reshuffled: true };
        }

        // Игра продолжается, ходов и комбинаций ещё достаточно.
        return { ended: false, win: false, reason: '', reshuffled: false };
    }

    // Пытаемся перемешать поле несколько раз подряд, пока не появится хотя бы один доступный ход
    // или не закончится лимит reshuffle. Возвращает true, если после перемешивания ходы появились.
    private _tryReshuffleUntilHasMove(): boolean {
        while (this.reshufflesLeft > 0) {
            this.reshufflesLeft--;
            this.board.shuffleColors();

            if (this.hasAnyMove()) {
                return true;
            }
        }

        // Лимит исчерпан: проверяем ещё раз, появились ли ходы после последнего перемешивания.
        return this.hasAnyMove();
    }

    // Строим детальное описание удалённых тайлов и агрегируем их по цветам.
    private _buildRemovedInfo(tiles: TileModel[]): { list: RemovedTileInfo[]; byColor: RemovedByColor } {
        const list: RemovedTileInfo[] = [];
        const byColor: RemovedByColor = {};

        for (let i = 0; i < tiles.length; i++) {
            const t = tiles[i];
            list.push({
                id: t.id,
                row: t.row,
                col: t.col,
                color: t.color,
            });

            // Считаем, сколько тайлов каждого цвета было удалено за этот ход.
            const prev = byColor[t.color] || 0;
            byColor[t.color] = prev + 1;
        }

        return { list, byColor };
    }
}
