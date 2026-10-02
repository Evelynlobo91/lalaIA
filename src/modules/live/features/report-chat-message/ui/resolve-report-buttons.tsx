"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert } from "@/shared/ui";
import { resolveChatReportAction } from "../report-chat-message.actions";

/** Backoffice: a moderação apaga a mensagem denunciada ou mantém (#193). As duas saídas fecham as denúncias. */
export function ResolveReportButtons({ messageId, authorName }: { messageId: string; authorName: string }) {
  const [state, action, pending] = useActionState<FormState<{ messageId: string; resolved: number }>, FormData>(resolveChatReportAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="messageId" value={messageId} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="remove" size="sm" variant="danger" loading={pending} aria-label={`Apagar a mensagem de ${authorName}`}>
          Apagar mensagem
        </Button>
        <Button type="submit" name="intent" value="keep" size="sm" variant="secondary" loading={pending} aria-label={`Manter a mensagem de ${authorName}`}>
          Manter
        </Button>
      </div>
      {state.status === "error" && <FormAlert>{state.message ?? "Não foi possível resolver a denúncia."}</FormAlert>}
    </form>
  );
}
