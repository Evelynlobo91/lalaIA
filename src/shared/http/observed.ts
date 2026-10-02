import { logger } from "../observability/logger";
import { requestIdFrom, runWithRequestContext } from "../observability/request-context";
import { errorResponse } from "./responses";

/**
 * Envolve um handler HTTP com contexto de requisição (requestId), log de acesso
 * estruturado e captura de exceções. Usado por jsonRoute/queryRoute.
 */
export function observed(handler: (request: Request) => Promise<Response>) {
  return async function route(request: Request): Promise<Response> {
    const requestId = requestIdFrom(request);
    return runWithRequestContext({ requestId }, async () => {
      const startedAt = performance.now();
      let response: Response;
      try {
        response = await handler(request);
      } catch (error) {
        response = errorResponse(error);
      }
      response.headers.set("x-request-id", requestId);

      const { pathname } = new URL(request.url);
      const fields = { method: request.method, path: pathname, status: response.status, durationMs: Math.round(performance.now() - startedAt) };
      if (response.status >= 500) logger().error("requisição falhou", fields);
      else logger().info("requisição", fields);
      return response;
    });
  };
}
