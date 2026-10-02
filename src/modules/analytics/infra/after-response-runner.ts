import { after } from "next/server";
import { errorReporter, logger } from "@/shared/observability";
import type { BackgroundRunner } from "../domain/interaction";

/**
 * Roda a tarefa depois que a resposta foi enviada (`after` do Next), sem bloquear a pessoa.
 * Fora de uma requisição (ex.: scripts), `after` não existe: roda em segundo plano do mesmo jeito.
 * Falha no Analytics nunca chega ao usuário: só é logada e reportada.
 */
export class AfterResponseRunner implements BackgroundRunner {
  run(task: () => Promise<void>): void {
    const safe = async () => {
      try {
        await task();
      } catch (error) {
        logger().error("falha ao registrar interação", { err: error });
        errorReporter().capture(error, { module: "analytics" });
      }
    };
    try {
      after(safe);
    } catch {
      void safe();
    }
  }
}
