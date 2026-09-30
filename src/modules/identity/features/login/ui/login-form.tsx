"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import { loginAction } from "../login.action";
import type { LoginResult } from "../login.use-case";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState<LoginResult>, FormData>(loginAction, idleFormState);
  const [showPassword, setShowPassword] = useState(false);

  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values = state.status === "error" ? (state.values ?? {}) : {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}
      {next && <input type="hidden" name="next" value={next} />}

      <TextField label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={values.email} errors={errors.email} />

      <TextField
        label="Senha"
        name="password"
        type={showPassword ? "text" : "password"}
        autoComplete="current-password"
        required
        errors={errors.password}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            className="rounded-lg p-2 text-muted hover:text-fg"
          >
            {showPassword ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          </button>
        }
      />

      <Button type="submit" size="lg" fullWidth loading={pending}>
        Entrar
      </Button>
    </form>
  );
}
