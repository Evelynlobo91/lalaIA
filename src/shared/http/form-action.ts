import "server-only";
import { z } from "zod";
import { DomainError, ValidationError } from "../kernel/errors";
import type { Result } from "../kernel/result";
import { errorReporter } from "../observability/error-reporter";
import { logger } from "../observability/logger";
import { runWithRequestContext } from "../observability/request-context";
import type { FieldErrors, FormState } from "./form-state";

export type { FieldErrors, FormState } from "./form-state";
export { idleFormState } from "./form-state";

type Options = {
  /** Nome da ação no log (ex.: "identity.login"). */
  name?: string;
  /** Campos devolvidos ao formulário em caso de erro para não perder o que foi digitado. Nunca inclua senhas. */
  keepValues?: string[];
  /** Campos que podem se repetir (ex.: checkboxes com o mesmo name) e devem virar lista. */
  arrays?: string[];
};

/** Detalhes no formato [{ path: ["campo"], message }] (zod e casos de uso) → erros por campo. */
function fieldErrorsFrom(details: unknown): FieldErrors | undefined {
  if (!Array.isArray(details)) return undefined;
  const out: FieldErrors = {};
  for (const issue of details as Array<{ path?: unknown[]; message?: string }>) {
    const key = String(issue.path?.[0] ?? "");
    if (key && issue.message) (out[key] ??= []).push(issue.message);
  }
  return Object.keys(out).length ? out : undefined;
}

function formDataToObject(formData: FormData, arrays: string[] = []): Record<string, unknown> {
  const raw: Record<string, unknown> = Object.fromEntries(formData);
  for (const key of arrays) raw[key] = formData.getAll(key);
  return raw;
}

/**
 * Adaptador de Server Action (para `useActionState`), equivalente ao jsonRoute:
 * valida o FormData com zod, chama o caso de uso e traduz o Result em estado do formulário.
 */
export function formAction<S extends z.ZodType, T>(schema: S, handler: (input: z.infer<S>) => Promise<Result<T, DomainError>>, options: Options = {}) {
  return async (_previous: FormState<T>, formData: FormData): Promise<FormState<T>> =>
    runWithRequestContext({ requestId: crypto.randomUUID() }, async () => {
      const startedAt = performance.now();
      const state = await run(formData);
      // Log de acesso das actions (equivalente ao das rotas): resultado e duração, sem dados do formulário.
      const fields = { action: options.name ?? "server-action", outcome: state.status, durationMs: Math.round(performance.now() - startedAt) };
      logger().info("server action", fields);
      return state;
    });

  async function run(formData: FormData): Promise<FormState<T>> {
    const raw = formDataToObject(formData, options.arrays);
    const values = Object.fromEntries((options.keepValues ?? []).map((key) => [key, String(raw[key] ?? "")]));

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", fieldErrors: z.flattenError(parsed.error).fieldErrors as FieldErrors, values };
    }

    try {
      const result = await handler(parsed.data);
      if (result.ok) return { status: "success", data: result.value };
      // Validação feita no caso de uso (ex.: "lugar não encontrado") também marca o campo.
      const fieldErrors = result.error instanceof ValidationError ? fieldErrorsFrom(result.error.details) : undefined;
      return { status: "error", message: fieldErrors ? undefined : result.error.message, fieldErrors, values };
    } catch (error) {
      logger().error("erro inesperado em server action", { err: error });
      errorReporter().capture(error);
      return { status: "error", message: "Algo deu errado. Tente novamente em instantes.", values };
    }
  }
}
