import { z } from "zod";
import { queryRoute } from "@/shared/http/json-route";
import { ok } from "@/shared/kernel";
import type { PlaceOwnershipRepository } from "../../domain/place-ownership";

const searchSchema = z.object({ q: z.string().trim().min(2, "Digite pelo menos 2 letras.").max(80) });

/** GET /api/places/search?q=... — sugestões por nome (sem acento), usadas em seletores de lugar. */
export function searchPlacesRoute(repo: () => PlaceOwnershipRepository) {
  return queryRoute(searchSchema, async ({ q }) => {
    const results = await repo().searchByName(q, 8);
    // Para o público: sem a informação de quem administra.
    return ok(results.map(({ id, name, categoryLabel, neighborhood }) => ({ id, name, categoryLabel, neighborhood })));
  });
}
