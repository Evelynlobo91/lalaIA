"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert } from "@/shared/ui";
import { acceptInviteAction } from "../convert-lead.actions";

/** Botão de aceitar o convite de parceiro (#150). A conta é a da sessão; o token vem do link. */
export function AcceptInviteForm({ token, businessName }: { token: string; businessName: string }) {
  const [state, action, pending] = useActionState<FormState<{ partnerId: string | null }>, FormData>(acceptInviteAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {state.status === "error" && <FormAlert>{state.message ?? "Não foi possível aceitar o convite."}</FormAlert>}
      <Button type="submit" loading={pending} className="self-start">
        Aceitar e abrir o portal de {businessName}
      </Button>
    </form>
  );
}
