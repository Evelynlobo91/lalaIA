import { z } from "zod";

/** Id do desbloqueio na URL pública (/conquistas/[id]): uuid aleatório, impossível de adivinhar. */
export const shareIdSchema = z.uuid();
