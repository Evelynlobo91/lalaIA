// Tipos e estado inicial de formulários com Server Actions. Seguro para o navegador:
// não importe nada de servidor aqui (o adaptador fica em form-action.ts).
export type FieldErrors = Partial<Record<string, string[]>>;

export type FormState<T> =
  | { status: "idle" }
  | { status: "success"; data: T }
  | { status: "error"; message?: string; fieldErrors?: FieldErrors; values?: Record<string, string> };

export const idleFormState = { status: "idle" } as const;
