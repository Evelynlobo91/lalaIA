"use client";

import { Copy, Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { idleFormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import { revealStreamKeyAction, rotateStreamKeyAction } from "../stream-key.actions";

const MASK = "•".repeat(24);

/**
 * Chave de transmissão mascarada. A chave só sai do servidor quando o dono pede para revelar ou copiar
 * (não fica no HTML da página). "Gerar nova chave" invalida a anterior no provedor.
 */
export function StreamKeyField({ streamId }: { streamId: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const [pending, startTransition] = useTransition();

  async function fetchKey(): Promise<string | null> {
    if (key) return key;
    const form = new FormData();
    form.set("streamId", streamId);
    const state = await revealStreamKeyAction(idleFormState, form);
    if (state.status === "success") {
      setKey(state.data.streamKey);
      return state.data.streamKey;
    }
    setMessage(state.status === "error" ? (state.message ?? "Não foi possível obter a chave.") : null);
    return null;
  }

  const toggle = () =>
    startTransition(async () => {
      if (visible) return setVisible(false);
      if (await fetchKey()) setVisible(true);
    });

  const copy = () =>
    startTransition(async () => {
      const value = await fetchKey();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setMessage("Chave copiada.");
      } catch {
        setVisible(true);
        setMessage("Não foi possível copiar automaticamente: selecione e copie a chave.");
      }
    });

  const rotate = () =>
    startTransition(async () => {
      const form = new FormData();
      form.set("streamId", streamId);
      const state = await rotateStreamKeyAction(idleFormState, form);
      setConfirmingRotate(false);
      if (state.status === "success") {
        setKey(null);
        setVisible(false);
        setMessage("Nova chave gerada. Atualize o OBS/Larix: a anterior não funciona mais.");
      } else if (state.status === "error") {
        setMessage(state.message ?? "Não foi possível gerar uma nova chave.");
      }
    });

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <KeyRound aria-hidden className="size-4" /> Chave de transmissão
      </span>
      <output
        aria-label="Chave de transmissão"
        className="block min-h-11 select-all break-all rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-sm"
      >
        {visible && key ? key : MASK}
      </output>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={toggle} loading={pending && !visible}>
          {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          {visible ? "Ocultar chave" : "Revelar chave"}
        </Button>
        <Button size="sm" variant="secondary" onClick={copy} disabled={pending}>
          <Copy aria-hidden className="size-4" /> Copiar chave
        </Button>
        {confirmingRotate ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm">A chave atual vai parar de funcionar. Continuar?</span>
            <Button size="sm" variant="danger" onClick={rotate} loading={pending}>
              Sim, gerar nova
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingRotate(false)}>
              Voltar
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmingRotate(true)} disabled={pending}>
            <RefreshCw aria-hidden className="size-4" /> Gerar nova chave
          </Button>
        )}
      </div>
      <p className="text-sm text-muted" role="status" aria-live="polite">
        {message ?? "Não compartilhe a chave: quem a tiver transmite em seu nome."}
      </p>
    </div>
  );
}
