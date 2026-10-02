import { z } from "zod";

// Payload de progression.XpGranted, validado na entrada do handler.
export const xpGrantedSchema = z.object({ userId: z.uuid(), amount: z.number().int().min(1), reason: z.string().min(1) });

export const userIdSchema = z.uuid();
