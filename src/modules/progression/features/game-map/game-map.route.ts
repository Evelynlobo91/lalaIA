import { withUser } from "@/modules/identity";
import { ok } from "@/shared/kernel";
import type { GetGameMap } from "./game-map.use-case";

/** GET /api/progression/game-map — GeoJSON do mapa de exploração da pessoa logada (401 sem sessão). */
export function gameMapRoute(gameMap: () => GetGameMap) {
  const load = withUser(async (_input: undefined, user) => ok(await gameMap().execute(user.id)));
  return async function GET(): Promise<Response> {
    const result = await load(undefined);
    if (!result.ok) return Response.json({ error: { code: "unauthorized", message: result.error.message } }, { status: 401 });
    return Response.json(result.value, { headers: { "cache-control": "private, no-store" } });
  };
}
