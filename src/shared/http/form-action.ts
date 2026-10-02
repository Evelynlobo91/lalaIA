import "server-only";
import { z } from "zod";
import { DomainError } from "../kernel/errors";
import type { Result } from "../kernel/result";
import { errorReporter } from "../observability/error-reporter";
import { logger } from "../observability/logger";
import { runWithRequestContext } from "../observability/request-context";
import type { FieldErrors, FormState } from "./form-state";

export type { FieldErrors, FormState } from "./form-state";
export { idleFormState } from "./form-state";

type Options = {
  /** Campos devolvidos ao formulário em caso de erro para não perder o que foi digitado. Nunca inclua senhas. */
  keepValues?: string[];
};

/**
 * Adaptador de Server Action (para `useActionState`), equivalente ao jsonRoute:
 * valida o FormData com zod, chama o caso de uso e traduz o Result em estado do formulário.
 */
export function formAction<S extends z.ZodType, T>(schema: S, handler: (input: z.infer<S>) => Promise<Result<T, DomainError>>, options: Options = {}) {
  return async (_previous: FormState<T>, formData: FormData): Promise<FormState<T>> =>
    runWithRequestContext({ requestId: crypto.randomUUID() }, async () => {
      const raw = Object.fromEntries(formData);
      const values = Object.fromEntries((options.keepValues ?? []).map((key) => [key, String(raw[key] ?? "")]));

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return { status: "error", fieldErrors: z.flattenError(parsed.error).fieldErrors as FieldErrors, values };
      }

      try {
        const result = await handler(parsed.data);
        if (result.ok) return { status: "success", data: result.value };
        return { status: "error", message: result.error.message, values };
      } catch (error) {
        logger().error("erro inesperado em server action", { err: error });
        errorReporter().capture(error);
        return { status: "error", message: "Algo deu errado. Tente novamente em instantes.", values };
      }
    });
}
