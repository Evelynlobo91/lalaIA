import { z } from "zod";
import type { PlaceCursor } from "../../domain/place-card";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

// Cursor opaco para o cliente: base64url de { name, id }. Validado ao voltar (pode ter sido adulterado).
const cursorPayload = z.object({ name: z.string().min(1).max(200), id: z.uuid() });

export function encodeCursor(cursor: PlaceCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(value: string): PlaceCursor | null {
  try {
    const parsed = cursorPayload.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const listPlacesSchema = z.object({
  cursor: z
    .string()
    .max(600)
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      const cursor = decodeCursor(value);
      if (!cursor) {
        ctx.addIssue({ code: "custom", message: "Cursor inválido." });
        return z.NEVER;
      }
      return cursor;
    }),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type ListPlacesInput = z.infer<typeof listPlacesSchema>;
