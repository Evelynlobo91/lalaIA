import { z } from "zod";

// Payloads dos eventos de missões, validados na entrada do módulo (não confiamos no formato de outro módulo).
const xp = z.number().int().min(1).max(10_000);

export const stepCompletedSchema = z.object({ userId: z.uuid(), missionId: z.uuid(), stepId: z.uuid(), xp });
export const missionCompletedSchema = z.object({ userId: z.uuid(), missionId: z.uuid(), xp });
export const eventIdSchema = z.uuid();
