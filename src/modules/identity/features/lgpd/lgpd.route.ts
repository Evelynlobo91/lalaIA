import { sql } from "@/shared/db/sql";
import { observed } from "@/shared/http/observed";
import { logger } from "@/shared/observability";
import { IdentityPersonalData } from "../../infra/lgpd-adapters";
import { getCurrentUser } from "../session/current-user";
import { ExportPersonalData, type PersonalDataSource } from "./lgpd.use-case";

/**
 * GET /api/me/export — todos os dados da pessoa logada em JSON (download). `sources` vêm da composição da
 * aplicação (um por módulo); os dados do próprio identity entram sempre primeiro. Sem cache.
 */
export function exportPersonalDataRoute(sources: () => readonly PersonalDataSource[]) {
  return observed(async () => {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: { code: "unauthorized", message: "Entre para exportar seus dados." } }, { status: 401 });
    const useCase = new ExportPersonalData([new IdentityPersonalData(sql()), ...sources()], logger().child({ module: "identity", slice: "lgpd" }));
    const data = await useCase.execute(user);
    const day = data.geradoEm.slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="lalaia-meus-dados-${day}.json"`,
        "cache-control": "no-store",
      },
    });
  });
}
