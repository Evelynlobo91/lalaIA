import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  errors?: string[];
  hint?: ReactNode;
  /** Ícone decorativo à esquerda dentro do campo (ex.: envelope no e-mail). */
  leading?: ReactNode;
  /** Elemento à direita dentro do campo (ex.: botão mostrar senha). */
  trailing?: ReactNode;
};

/** Campo de texto acessível: label associado, erros anunciados e ligados ao input. */
export function TextField({ label, errors, hint, leading, trailing, className, id, ...props }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-dica`;
  const errorId = `${inputId}-erro`;
  const hasError = Boolean(errors?.length);
  const describedBy = [hint && hintId, hasError && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      <div className="relative">
        {leading && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted [&_svg]:size-5">
            {leading}
          </div>
        )}
        <input
          id={inputId}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-fg placeholder:text-muted",
            "aria-invalid:border-danger",
            Boolean(leading) && "pl-12",
            Boolean(trailing) && "pr-12",
            className,
          )}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      {hint && (
        <div id={hintId} className="text-sm text-muted">
          {hint}
        </div>
      )}
      {hasError && (
        <ul id={errorId} className="flex flex-col gap-0.5 text-sm text-danger" aria-live="polite">
          {errors!.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CheckboxProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; errors?: string[] };

export function Checkbox({ label, errors, id, className, ...props }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-erro`;
  const hasError = Boolean(errors?.length);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          className={cn("mt-0.5 size-5 shrink-0 accent-[var(--brand)]", className)}
          {...props}
        />
        <label htmlFor={inputId} className="text-sm">
          {label}
        </label>
      </div>
      {hasError && (
        <p id={errorId} className="text-sm text-danger" aria-live="polite">
          {errors!.join(" ")}
        </p>
      )}
    </div>
  );
}

export function FormAlert({ children, variant = "danger" }: { children: ReactNode; variant?: "danger" | "success" }) {
  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={cn("rounded-xl px-4 py-3 text-sm", variant === "danger" ? "bg-danger text-danger-fg" : "bg-success text-success-fg")}
    >
      {children}
    </div>
  );
}
