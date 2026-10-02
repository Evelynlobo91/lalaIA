"use client";

import { Copy } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Button, FormAlert, TextField } from "@/shared/ui";
import { INVITE_DAYS, inviteKinds } from "../../../domain/conversion";
import { startConversionAction } from "../convert-lead.actions";

/**
 * Converter em parceiro (#150): o comercial completa os dados do cadastro e gera o link de convite.
 * `placeField` é o seletor de lugar (do módulo places), opcional.
 */
export function ConvertLeadForm({ leadId, phone, hasOpenInvite, placeField }: { leadId: string; phone: string; hasOpenInvite: boolean; placeField: ReactNode }) {
  const [state, action, pending] = useActionState<FormState<{ token: string; expiresAt: Date }>, FormData>(startConversionAction, idleFormState);
  const [copied, setCopied] = useState(false);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values = state.status === "error" ? (state.values ?? {}) : {};

  if (state.status === "success") {
    const link = `${window.location.origin}/parceiro/convite/${state.data.token}`;
    const copy = async () => {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    };
    return (
      <div className="flex flex-col gap-3" role="status">
        <FormAlert variant="success">Convite gerado. Envie o link para a pessoa de contato: ele vale até {formatDateTime(new Date(state.data.expiresAt))}.</FormAlert>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Link do convite
          <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm font-normal" />
        </label>
        <p className="text-sm text-muted">Este link aparece só agora. Se perder, gere outro: o anterior deixa de valer.</p>
        <Button type="button" size="sm" variant="secondary" onClick={copy} className="self-start">
          <Copy aria-hidden className="size-4" /> {copied ? "Link copiado" : "Copiar link"}
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" aria-label="Converter em parceiro" noValidate>
      <input type="hidden" name="leadId" value={leadId} />
      {hasOpenInvite && <p className="text-sm text-muted">Já existe um convite em aberto para este lead. Gerar outro invalida o link anterior.</p>}
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Tipo de parceiro</legend>
        {inviteKinds.map((kind, index) => (
          <label key={kind.id} className="flex items-center gap-3 text-sm">
            <input type="radio" name="kind" value={kind.id} required defaultChecked={(values.kind ?? inviteKinds[0].id) === kind.id || (!values.kind && index === 0)} className="size-5 accent-[var(--brand)]" />
            {kind.label}
          </label>
        ))}
        {errors.kind && <span className="text-sm text-danger">{errors.kind[0]}</span>}
      </fieldset>

      <TextField label="Telefone do negócio" name="phone" type="tel" required defaultValue={values.phone ?? phone} errors={errors.phone} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Descrição do negócio
        <textarea
          name="description"
          required
          minLength={20}
          maxLength={600}
          rows={3}
          defaultValue={values.description}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-base font-normal"
        />
        {errors.description && <span className="text-sm font-normal text-danger">{errors.description[0]}</span>}
      </label>

      {placeField}

      <p className="text-sm text-muted">
        A pessoa de contato entra (ou cria a conta) pelo link e aceita o convite. Ela vira parceira aprovada com estes dados, sem preencher o cadastro de novo. O link vale {INVITE_DAYS} dias.
      </p>
      <Button type="submit" loading={pending} className="self-start">
        Gerar link de convite
      </Button>
    </form>
  );
}
