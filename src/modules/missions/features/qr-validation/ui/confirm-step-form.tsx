"use client";

import { QrCode } from "lucide-react";
import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert } from "@/shared/ui";
import { completeStepAction } from "../qr-validation.action";
import type { StepCompleted } from "../complete-step.use-case";

/** Confirmação da etapa: um toque (POST) depois de abrir o link do QR. GET nunca altera dados. */
export function ConfirmStepForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState<StepCompleted>, FormData>(completeStepAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {state.status === "error" && <FormAlert>{state.message ?? "Não foi possível validar a etapa."}</FormAlert>}
      <Button type="submit" size="lg" loading={pending} className="self-start">
        <QrCode aria-hidden className="size-5" /> Concluir etapa
      </Button>
    </form>
  );
}
