export function exponentialGrowth(input: number, boostFactor: number = 1.0): number {
  // Ограничиваем вход [2, 30]
  const x = Math.max(2, Math.min(30, input));
  
  // Управляемый экспоненциальный прирост
  const boost = 12 * boostFactor * (Math.exp(0.18 * (x - 2)) - 1) / (Math.exp(0.18 * 18) - 1);
  
  return Math.round(x + boost);
}