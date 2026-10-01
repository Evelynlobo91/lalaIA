import { z } from "zod";

// Eventos que disparam a avaliação: de qualquer um, só precisamos do usuário (validado aqui).
export const achievementTriggerSchema = z.object({ userId: z.uuid() });

export const achievementUnlockedSchema = z.object({
  userId: z.uuid(),
  achievementId: z.string().regex(/^[a-z0-9-]{1,60}$/),
  unlockId: z.uuid(),
  title: z.string().min(1).max(120),
  bonusXp: z.number().int().min(0).max(10_000),
});
