import type { z } from "zod";
import { ValidationError, type DomainError } from "../kernel/errors";
import type { Result } from "../kernel/result";
import { observed } from "./observed";
import { errorResponse, resultResponse } from "./responses";

type Handler<S extends z.ZodType, T> = (input: z.infer<S>, request: Request) => Promise<Result<T, DomainError>>;

/**
 * Adaptador HTTP padrão de um slice: lê o JSON do body, valida com zod (RNF07),
 * chama o caso de uso e converte o Result em Response. Sem regra de negócio aqui.
 */
export function jsonRoute<S extends z.ZodType, T>(
  schema: S,
  handler: Handler<S, T>,
  options: { successStatus?: number } = {},
) {
  return observed(async (request) => {
    const raw = await request.json().catch(() => undefined);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(new ValidationError("Dados inválidos.", parsed.error.issues));
    }
    return resultResponse(await handler(parsed.data, request), options.successStatus);
  });
}

/** Variante para GET: valida os query params da URL. */
export function queryRoute<S extends z.ZodType, T>(schema: S, handler: Handler<S, T>) {
  return observed(async (request) => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = schema.safeParse(params);
    if (!parsed.success) {
      return errorResponse(new ValidationError("Parâmetros inválidos.", parsed.error.issues));
    }
    return resultResponse(await handler(parsed.data, request));
  });
}
