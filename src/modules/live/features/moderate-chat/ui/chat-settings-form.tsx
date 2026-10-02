"use client";

import { MessageCircle } from "lucide-react";
import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import { saveChatSettingsAction } from "../moderate-chat.actions";
import { CHAT_SLOW_OPTIONS } from "../moderate-chat.use-case";

const SLOW_LABELS: Record<number, string> = { 0: "Desligado", 10: "1 mensagem a cada 10 s", 30: "1 mensagem a cada 30 s" };
const selectClass = "h-11 min-w-0 rounded-xl border border-border bg-surface px-3 text-sm";

/** Portal: o anfitrião liga/desliga o chat da transmissão e escolhe o modo lento (#192). As reações continuam valendo. */
export function ChatSettingsForm({ streamId, label, chatEnabled, slowSeconds }: { streamId: string; label: string; chatEnabled: boolean; slowSeconds: number }) {
  const [state, action, pending] = useActionState<FormState<{ streamId: string; chatEnabled: boolean; slowSeconds: number }>, FormData>(saveChatSettingsAction, idleFormState);
  const current = state.status === "success" ? state.data : { chatEnabled, slowSeconds };

  return (
    <form action={action} className="flex flex-col gap-2" aria-label={`Chat da transmissão de ${label}`}>
      <input type="hidden" name="streamId" value={streamId} />
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <MessageCircle aria-hidden className="size-4" /> Chat da live
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          Chat
          <select key={`chat-${current.chatEnabled}`} name="chatEnabled" defaultValue={current.chatEnabled ? "on" : "off"} className={selectClass}>
            <option value="on">Ligado</option>
            <option value="off">Desligado (só reações)</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          Modo lento
          <select key={`lento-${current.slowSeconds}`} name="slowSeconds" defaultValue={String(current.slowSeconds)} className={selectClass}>
            {CHAT_SLOW_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {SLOW_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="secondary" loading={pending} className="h-11" aria-label={`Salvar o chat de ${label}`}>
          Salvar chat
        </Button>
      </div>
      <p className="text-sm" role="status" aria-live="polite">
        {state.status === "success" && "Chat atualizado."}
        {state.status === "error" && <span className="text-danger">{state.message ?? "Não foi possível salvar."}</span>}
      </p>
    </form>
  );
}
