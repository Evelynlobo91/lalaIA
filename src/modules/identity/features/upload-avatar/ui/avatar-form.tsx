"use client";

import { Camera } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Avatar, FormAlert, cn } from "@/shared/ui";
import { AVATAR_MAX_BYTES } from "../../../domain/avatar";
import { uploadAvatarAction } from "../upload-avatar.action";

/** Escolher a foto já envia (sem passo extra). A validação de verdade, pelos bytes reais, é no servidor. */
export function AvatarForm({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [state, action, pending] = useActionState<FormState<{ avatarUrl: string }>, FormData>(uploadAvatarAction, idleFormState);
  const [clientError, setClientError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const shown = state.status === "success" ? state.data.avatarUrl : avatarUrl;
  const serverError = state.status === "error" ? (state.fieldErrors?.avatar?.[0] ?? state.message ?? "Não foi possível enviar a foto.") : null;

  return (
    <form ref={formRef} action={action} className="flex flex-col items-start gap-3">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar name={name} src={shown} size="lg" className={cn(pending && "opacity-50")} />
          {pending && <span aria-hidden className="absolute inset-0 m-auto size-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />}
        </div>
        <label
          className={cn(
            "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-surface-2 px-4 font-semibold",
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
            pending && "pointer-events-none opacity-50",
          )}
        >
          <Camera aria-hidden className="size-5" />
          {pending ? "Enviando..." : "Trocar foto"}
          <input
            type="file"
            name="avatar"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > AVATAR_MAX_BYTES) {
                setClientError("A imagem deve ter no máximo 2 MB.");
                e.target.value = "";
                return;
              }
              setClientError(null);
              formRef.current?.requestSubmit();
            }}
          />
        </label>
      </div>
      <p className="text-sm text-muted">JPG, PNG ou WebP, até 2 MB.</p>
      <div aria-live="polite">
        {clientError && <FormAlert>{clientError}</FormAlert>}
        {!clientError && serverError && <FormAlert>{serverError}</FormAlert>}
        {!clientError && state.status === "success" && !pending && <FormAlert variant="success">Foto atualizada.</FormAlert>}
      </div>
    </form>
  );
}
