"use client";

import { ArrowRight, Check, Eye, EyeOff, Lock, Mail, MailCheck, User, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, Checkbox, FormAlert, TextField, cn } from "@/shared/ui";
import { passwordRules } from "../../../domain/password-policy";
import { registerAction } from "../register.action";
import type { RegisterResult } from "../register.use-case";

export function RegisterForm() {
  const [state, action, pending] = useActionState<FormState<RegisterResult>, FormData>(registerAction, idleFormState);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  if (state.status === "success") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-surface-2 text-brand">
          <MailCheck aria-hidden className="size-7" />
        </span>
        <h2 className="text-xl font-semibold">Confira seu e-mail</h2>
        <p className="text-muted">Enviamos um link de confirmação. Abra o e-mail e toque no link para ativar sua conta.</p>
      </div>
    );
  }

  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values = state.status === "error" ? (state.values ?? {}) : {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}

      <TextField
        label="Nome"
        name="displayName"
        autoComplete="name"
        placeholder="Como quer ser chamado(a)"
        required
        maxLength={80}
        defaultValue={values.displayName}
        errors={errors.displayName}
        leading={<User />}
      />

      <TextField
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="voce@email.com"
        required
        defaultValue={values.email}
        errors={errors.email}
        leading={<Mail />}
      />

      <TextField
        label="Senha"
        name="password"
        type={showPassword ? "text" : "password"}
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        // As regras já aparecem na lista acima; o erro só aponta para ela.
        errors={errors.password ? ["A senha não atende a todos os requisitos."] : undefined}
        leading={<Lock />}
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
        hint={
          <ul className="flex flex-col gap-0.5" aria-label="Requisitos da senha">
            {passwordRules
              .filter((rule) => rule.id !== "max_length")
              .map((rule) => {
                const met = rule.test(password);
                return (
                  <li key={rule.id} className={cn("flex items-center gap-1.5", met && "text-success")}>
                    {met ? <Check aria-hidden className="size-4" /> : <X aria-hidden className="size-4" />}
                    {rule.label}
                    <span className="sr-only">{met ? "(atendido)" : "(pendente)"}</span>
                  </li>
                );
              })}
          </ul>
        }
      />

      <Checkbox
        name="acceptTerms"
        errors={errors.acceptTerms}
        label={
          <>
            Li e aceito os{" "}
            <Link href="/termos" target="_blank" className="font-medium text-brand underline">
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" target="_blank" className="font-medium text-brand underline">
              Política de Privacidade
            </Link>
            .
          </>
        }
      />

      <Button type="submit" size="lg" fullWidth loading={pending}>
        Criar minha conta
        <ArrowRight aria-hidden className="size-5" />
      </Button>
    </form>
  );
}
