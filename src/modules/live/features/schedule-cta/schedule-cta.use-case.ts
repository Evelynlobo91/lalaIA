import { BusinessRuleError, ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { CTA_LIMITS, agendaOfDay, type CtaAgendaEntry, type CtaRecord, type CtaType } from "../../domain/cta";
import type { LiveActor, StreamRecord, StreamRepository } from "../../domain/stream";
import type { CtaDestination, CtaOption, CtaTypeHandler } from "./cta-types";
import type { CtaDraft } from "./schedule-cta.schema";

export type CtaToSave = Omit<CtaDraft, "url" | "refId"> & CtaDestination & { streamId: string };

/** Persistência dos CTAs. `actorId` vem da sessão; as consultas rodam "como o usuário" sob RLS. */
export interface CtaRepository {
  listByStream(actorId: string, streamId: string): Promise<CtaRecord[]>;
  find(actorId: string, ctaId: string): Promise<CtaRecord | null>;
  create(actorId: string, cta: CtaToSave): Promise<CtaRecord>;
  /** null se o CTA não existe ou não é do usuário. */
  update(actorId: string, ctaId: string, cta: CtaToSave): Promise<CtaRecord | null>;
  remove(actorId: string, ctaId: string): Promise<boolean>;
}

/** O plano da conta libera CTAs nas lives? (porta implementada pela API pública do módulo billing) */
export type CtaEntitlement = (ownerId: string) => Promise<boolean>;

const notYours = () => err(new ForbiddenError("Só o responsável pela transmissão programa as chamadas dela."));
const planRequired = () => err(new BusinessRuleError("plan_feature_required", "O plano atual não inclui chamadas na live. Mude de plano em Assinatura."));

/** #178 — O parceiro cria ou edita um CTA da própria transmissão: tipo, conteúdo, prioridade e agendamento. */
export class SaveCta {
  constructor(
    private readonly streams: Pick<StreamRepository, "findById">,
    private readonly ctas: Pick<CtaRepository, "listByStream" | "create" | "update">,
    private readonly handlers: Record<CtaType, CtaTypeHandler>,
    private readonly entitled: CtaEntitlement,
  ) {}

  async execute(actor: LiveActor, streamId: string, ctaId: string | undefined, draft: CtaDraft): Promise<Result<CtaRecord, DomainError>> {
    const stream = await this.streams.findById(streamId);
    if (!stream) return err(new NotFoundError("Transmissão"));
    if (stream.ownerId !== actor.id) return notYours();
    if (stream.status === "ended") return err(new BusinessRuleError("stream_ended", "Esta transmissão foi encerrada: não dá para programar chamadas nela."));
    if (!(await this.entitled(actor.id))) return planRequired();

    const existing = await this.ctas.listByStream(actor.id, streamId);
    if (ctaId ? !existing.some((c) => c.id === ctaId) : existing.length >= CTA_LIMITS.perStream) {
      return ctaId ? err(new NotFoundError("Chamada")) : err(new BusinessRuleError("too_many_ctas", `Cada transmissão pode ter até ${CTA_LIMITS.perStream} chamadas. Remova alguma para criar outra.`));
    }

    const { refId, url, ...content } = draft;
    const destination = await this.handlers[draft.type].resolve(actor.id, stream, { refId, url });
    if (!destination.ok) return destination;

    const toSave: CtaToSave = { ...content, ...destination.value, streamId };
    const saved = ctaId ? await this.ctas.update(actor.id, ctaId, toSave) : await this.ctas.create(actor.id, toSave);
    return saved ? ok(saved) : err(new NotFoundError("Chamada"));
  }
}

/** O parceiro remove um CTA seu. */
export class DeleteCta {
  constructor(private readonly ctas: Pick<CtaRepository, "remove">) {}

  async execute(actor: LiveActor, ctaId: string): Promise<Result<{ ctaId: string }, DomainError>> {
    return (await this.ctas.remove(actor.id, ctaId)) ? ok({ ctaId }) : err(new NotFoundError("Chamada"));
  }
}

export type CtaFormOptions = Record<CtaType, { field: CtaTypeHandler["field"]; defaultButton: string; options: CtaOption[] }>;

export type CtaPanel = {
  stream: Pick<StreamRecord, "id" | "status" | "entityType" | "entityId">;
  entitled: boolean;
  ctas: CtaRecord[];
  agenda: { timed: CtaAgendaEntry[]; whenLive: CtaRecord[] };
  options: CtaFormOptions;
};

/** Painel do parceiro: os CTAs da transmissão, a agenda do dia e as opções de cada tipo para o formulário. */
export class GetCtaPanel {
  constructor(
    private readonly streams: Pick<StreamRepository, "findById">,
    private readonly ctas: Pick<CtaRepository, "listByStream">,
    private readonly handlers: Record<CtaType, CtaTypeHandler>,
    private readonly entitled: CtaEntitlement,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** null se a transmissão não existe ou não é do usuário. */
  async execute(actor: LiveActor, streamId: string): Promise<CtaPanel | null> {
    const stream = await this.streams.findById(streamId);
    if (!stream || stream.ownerId !== actor.id) return null;
    const [ctas, entitled, optionLists] = await Promise.all([
      this.ctas.listByStream(actor.id, streamId),
      this.entitled(actor.id),
      Promise.all(Object.values(this.handlers).map(async (h) => [h.type, { field: h.field, defaultButton: h.defaultButton, options: await h.options(actor.id) }] as const)),
    ]);
    const liveSince = stream.status === "live" ? stream.signalChangedAt : null;
    return {
      stream: { id: stream.id, status: stream.status, entityType: stream.entityType, entityId: stream.entityId },
      entitled,
      ctas,
      agenda: agendaOfDay(ctas, this.now(), liveSince),
      options: Object.fromEntries(optionLists) as CtaFormOptions,
    };
  }
}
