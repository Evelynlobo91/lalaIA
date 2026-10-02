/** Arredonda para 4 casas (~10 m): suficiente para distância, sem guardar a posição exata no histórico/links. */
export const roundCoordinate = (value: number) => Math.round(value * 10_000) / 10_000;
