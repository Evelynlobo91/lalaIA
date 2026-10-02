import { z } from "zod";
import { BusinessRuleError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { CtaRecord } from "../../domain/cta";
import type { LiveActor, StreamRepository } from "../../domain/stream";
import type { CtaEntitlement, CtaRepository } from "../schedule-cta/schedule-cta.use-case";

/** Por quanto tempo a chamada solta à mão fica no ar (minutos). */
export const TRIGGER_MINUTES = [5, 10, 15] as const;

export const triggerCtaSchema = z.object({
  ctaId: z.uuid(),
  minutes: z.coerce.number().refine((v) => (TRIGGER_MINUTES as readonly number[]).includes(v), "Escolha por quanto tempo."),
});

export const stopCtaSchema = z.object({ ctaId: z.uuid() });

/** Grava e limpa o disparo como o usuário (RLS: só o dono). null se o CTA não existe ou não é dele. */
export interface CtaTriggerStore {
  setTrigger(actorId: string, ctaId: string, window: { at: Date; until: Date } | null): Promise<CtaRecord | null>;
}

/**
 * #181 — O parceiro solta uma chamada agora, durante a live, por alguns minutos. Só com a transmissão AO VIVO
 * (fora do ar ninguém veria) e com o recurso `cta` no plano. Soltar de novo recomeça a contagem.
 */
export class TriggerCta {
  constructor(
    private readonly ctas: Pick<CtaRepository, "find">,
    private readonly streams: Pick<StreamRepository, "findById">,
    private readonly triggers: CtaTriggerStore,
    private readonly entitled: CtaEntitlement,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: LiveActor, ctaId: string, minutes: number): Promise<Result<CtaRecord, DomainError>> {
    const cta = await this.ctas.find(actor.id, ctaId);
    if (!cta) return err(new NotFoundError("Chamada"));
    const stream = await this.streams.findById(cta.streamId);
    if (!stream || stream.ownerId !== actor.id) return err(new NotFoundError("Chamada"));
    if (stream.status !== "live") return err(new BusinessRuleError("stream_not_live", "A transmissão não está ao vivo: a chamada só aparece com a live no ar."));
    if (!(await this.entitled(actor.id))) return err(new BusinessRuleError("plan_feature_required", "O plano atual não inclui chamadas na live. Mude de plano em Assinatura."));

    const at = this.now();
    const triggered = await this.triggers.setTrigger(actor.id, ctaId, { at, until: new Date(at.getTime() + minutes * 60_000) });
    return triggered ? ok(triggered) : err(new NotFoundError("Chamada"));
  }
}

/** O parceiro tira do ar a chamada que soltou (o agendamento dela continua valendo). */
export class StopCtaTrigger {
  constructor(private readonly triggers: CtaTriggerStore) {}

  async execute(actor: LiveActor, ctaId: string): Promise<Result<CtaRecord, DomainError>> {
    const stopped = await this.triggers.setTrigger(actor.id, ctaId, null);
    return stopped ? ok(stopped) : err(new NotFoundError("Chamada"));
  }
}
