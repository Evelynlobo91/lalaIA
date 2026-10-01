/** Faixas de preço (RF05), sobre o valor "a partir de" dos eventos. Valores da URL. */
export const priceRangeValues = ["gratis", "ate-50", "ate-100", "acima-100"] as const;
export type PriceRange = (typeof priceRangeValues)[number];

export const priceRanges: Record<PriceRange, { label: string; minCents: number; maxCents: number | null }> = {
  gratis: { label: "Grátis", minCents: 0, maxCents: 0 },
  "ate-50": { label: "Até R$ 50", minCents: 0, maxCents: 5_000 },
  "ate-100": { label: "Até R$ 100", minCents: 0, maxCents: 10_000 },
  "acima-100": { label: "Acima de R$ 100", minCents: 10_001, maxCents: null },
};
