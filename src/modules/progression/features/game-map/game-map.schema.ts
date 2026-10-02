import { z } from "zod";
import { GAME_STATES } from "../../domain/game-map";

/** Camadas ligadas na URL (`?camadas=missao,evento,live`); vazio = todas. "live" é a camada do módulo live. */
export const GAME_LAYERS = [...GAME_STATES, "live"] as const;
export type GameLayer = (typeof GAME_LAYERS)[number];

export const gameLayersParam = z
  .string()
  .max(100)
  .optional()
  .transform((value): GameLayer[] => {
    if (!value) return [...GAME_LAYERS];
    const picked = new Set(value.split(","));
    const valid = GAME_LAYERS.filter((l) => picked.has(l));
    return valid.length ? valid : [...GAME_LAYERS];
  });
