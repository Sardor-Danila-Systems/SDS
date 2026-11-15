/**
 * Money in the distribution screens. Unlike `formatMoney` it shows zero and
 * keeps cents — a split of $333 has them, and a dash would hide a real 0.
 */
export function formatShare(amount: number, currency: string) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: currency || "UZS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
