import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../kernel/errors";
import type { Result } from "../kernel/result";
import { errorReporter } from "../observability/error-reporter";
import { logger } from "../observability/logger";
import { currentRequestContext } from "../observability/request-context";

export type ErrorBody = { error: { code: string; message: string; details?: unknown; requestId?: string } };

// Único ponto que conhece a tradução erro de domínio → status HTTP (OCP: novo erro = nova linha).
const statusByError: ReadonlyArray<[abstract new (...args: never[]) => DomainError, number]> = [
  [ValidationError, 400],
  [UnauthorizedError, 401],
  [ForbiddenError, 403],
  [NotFoundError, 404],
  [ConflictError, 409],
  [BusinessRuleError, 422],
];

export function statusFor(error: DomainError): number {
  return statusByError.find(([type]) => error instanceof type)?.[1] ?? 400;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof DomainError) {
    const body: ErrorBody = { error: { code: error.code, message: error.message, details: error.details } };
    return Response.json(body, { status: statusFor(error) });
  }
  // Inesperado: registra e reporta com contexto, mas não vaza detalhes para o cliente.
  // O requestId volta na resposta para o suporte localizar o erro nos logs/Sentry.
  logger().error("erro inesperado", { err: error });
  errorReporter().capture(error);
  const requestId = currentRequestContext()?.requestId;
  const body: ErrorBody = { error: { code: "internal_error", message: "Algo deu errado. Tente novamente.", requestId } };
  return Response.json(body, { status: 500 });
}

export function resultResponse<T>(result: Result<T, DomainError>, successStatus = 200): Response {
  if (!result.ok) return errorResponse(result.error);
  if (successStatus === 204) return new Response(null, { status: 204 });
  return Response.json(result.value, { status: successStatus });
}
