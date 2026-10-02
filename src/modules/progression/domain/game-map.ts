/**
 * Estados de um lugar no "mapa como jogo" (RF34), do mais importante para o menos: um lugar com missão
 * ativa aparece como missão, mesmo que já seja conhecido. Ordem e nomes num lugar só.
 */
export const GAME_STATES = ["missao", "evento", "especial", "conhecido", "inexplorado"] as const;
export type GameState = (typeof GAME_STATES)[number];

export const gameStateLabels: Record<GameState, string> = {
  missao: "Missão ativa",
  evento: "Evento acontecendo",
  especial: "Experiência especial",
  conhecido: "Conhecido",
  inexplorado: "Não explorado",
};

/** Conjuntos de ids de lugares por situação da pessoa. */
export type GameMapFacts = {
  activeMission: ReadonlySet<string>;
  happeningEvent: ReadonlySet<string>;
  /** Lugares com missão disponível que a pessoa ainda não aceitou. */
  special: ReadonlySet<string>;
  /** Favoritados ou visitados (check-in). */
  known: ReadonlySet<string>;
};

export function stateOf(placeId: string, facts: GameMapFacts): GameState {
  if (facts.activeMission.has(placeId)) return "missao";
  if (facts.happeningEvent.has(placeId)) return "evento";
  if (facts.special.has(placeId)) return "especial";
  if (facts.known.has(placeId)) return "conhecido";
  return "inexplorado";
}
