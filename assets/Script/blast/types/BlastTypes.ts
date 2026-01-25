export interface GridPos {
    r: number;
    c: number;
}

export enum BoosterType {
    None = 0,
    Bomb = 1,      // "Бомба" — сжигает тайлы в радиусе R вокруг выбранной клетки
    Teleport = 2,  // "Телепорт" — меняет местами два выбранных тайла
}

export interface ScoringConfig {
    minGroupSize: number;
}

export interface BoardConfig {
    rows: number;
    cols: number;
    colorsCount: number;
}

export interface GameConfig extends BoardConfig, ScoringConfig {
    moves: number;                 // Количество ходов на партию
    targetScore: number;           // Целевое количество очков

    // Количество зарядов бустеров на одну партию. Если не задано в конфиге — по умолчанию 5.
    bombBoosterCharges?: number;      // Заряды "бомбы" на раунд
    teleportBoosterCharges?: number;  // Заряды "телепорта" на раунд

    // Радиус действия бомбы в клетках (по строке/столбцу). Если undefined — берём значение по умолчанию в логике.
    bombRadius?: number;

    // Максимальное количество автоматических перемешиваний поля, когда нет доступных ходов.
    // Если не указано, логика использует значение по умолчанию (3).
    maxReshuffles?: number;
}

// Подробная информация об удалённых тайлах за один ход — используется для анимаций и статистики.
export interface RemovedTileInfo {
    id: number;    // уникальный id тайла
    row: number;   // строка на поле
    col: number;   // колонка на поле
    color: number; // цвет тайла (индекс цвета)
}

// Агрегированные данные по количеству удалённых тайлов каждого цвета.
export interface RemovedByColor {
    [color: number]: number; // ключ — индекс цвета, значение — количество удалённых тайлов этого цвета
}

export interface TileMove {
    from: GridPos;
    to: GridPos;
}

export interface BlastStep {
    removed: number[]; // tile ids
    moved: Array<{ id: number; move: TileMove }>;
    spawned: Array<{ id: number; to: GridPos }>;
}
