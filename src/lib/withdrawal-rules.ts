export const WITHDRAWAL_COINS_PER_RUPEE = 100;

export function withdrawalCoinsFor(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0 || Math.round(amount * 100) !== amount * 100) {
    throw new Error("Withdrawal amount must be a non-negative rupee amount with at most two decimal places");
  }

  return Math.round(amount * WITHDRAWAL_COINS_PER_RUPEE);
}