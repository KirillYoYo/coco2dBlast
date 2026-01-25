// Простейшие "тесты" для логики автоматического перемешивания.
// Это не jest/mocha, а обычный скрипт с проверками через исключения.
// Его можно запускать из Node/ts-node, если настроить импорт путей.

import BlastGameLogic, { MoveOutcome } from '../BlastGameLogic';
import { GameConfig } from '../types/BlastTypes';

function assert(cond: boolean, msg: string) {
    if (!cond) {
        throw new Error('Assertion failed: ' + msg);
    }
}

// Тест: при отсутствии ходов логика после применения шага возвращает состояние окончания игры с reason === 'No moves'.
export function testReshuffleLimit() {
    const cfg: GameConfig = {
        rows: 3,
        cols: 3,
        colorsCount: 3,
        minGroupSize: 2,
        moves: 10,
        targetScore: 9999,
        maxReshuffles: 3,
    };

    const logic: any = new BlastGameLogic(cfg);

    // Подменяем hasAnyMove так, чтобы он всегда возвращал false — имитируем ситуацию "нет ходов".
    logic.hasAnyMove = () => false;

    // Подменяем shuffleColors, чтобы оно не меняло состояние (для стабильности теста).
    logic.board.shuffleColors = () => { /* no-op */ };

    // Вызываем приватный метод проверки окончания игры.
    const end = logic._checkEndAndMaybeReshuffle();
    assert(end.ended === true, 'Игра должна закончиться при отсутствии ходов и после исчерпания перемешиваний');
    assert(end.win === false, 'При отсутствии ходов после всех перемешиваний должно быть поражение');
    assert(end.reason === 'No moves', 'Причина окончания игры должна быть "No moves"');
}