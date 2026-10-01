import "server-only";
import { getCurrentUser } from "@/modules/identity";
import { jsonRoute } from "@/shared/http/json-route";
import type { RecordWantToGo } from "./want-to-go.use-case";
import { wantToGoSchema } from "./want-to-go.schema";

/** POST /api/favorites/want-to-go → 204. Quem clicou vem da sessão, se houver. */
export function wantToGoRoute(useCase: () => RecordWantToGo) {
  return jsonRoute(
    wantToGoSchema,
    async (input) => {
      const user = await getCurrentUser();
      return useCase().execute(user?.id ?? null, input);
    },
    { successStatus: 204 },
  );
}
