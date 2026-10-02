import { ConflictError, ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { LiveActor, StreamRecord, StreamRepository, StreamStatus, StreamTarget, StreamTargets } from "../../domain/stream";
import type { StreamingProvider } from "../../domain/streaming-provider";

const notYours = () => err(new ForbiddenError("Só o responsável pelo lugar ou pelo evento gera a chave de transmissão."));

/** RF18 — Gerar a chave de transmissão de um lugar/evento do próprio parceiro. Idempotente. */
export class ProvisionStream {
  constructor(
    private readonly streams: StreamRepository,
    private readonly targets: StreamTargets,
    private readonly provider: () => StreamingProvider,
  ) {}

  async execute(actor: LiveActor, target: StreamTarget): Promise<Result<StreamRecord, DomainError>> {
    if (!actor.isPartner) return err(new ForbiddenError("Só parceiros transmitem ao vivo."));
    if (!(await this.targets.owns(actor.id, target))) return notYours();

    const existing = await this.streams.findByTarget(target);
    if (existing) {
      return existing.ownerId === actor.id ? ok(existing) : err(new ConflictError("Este lugar ou evento já tem uma transmissão de outro responsável."));
    }

    const provider = this.provider();
    const provisioned = await provider.createStream();
    const created = await this.streams.create(actor.id, { ...target, provider: provider.name, ...provisioned });
    if (created) return ok(created);
    // Corrida com outro pedido: devolve a que ficou (o recurso criado agora no provedor fica sem uso).
    const winner = await this.streams.findByTarget(target);
    return winner && winner.ownerId === actor.id ? ok(winner) : err(new ConflictError("Este lugar ou evento já tem uma transmissão."));
  }
}

/** Gera uma chave nova no provedor; a anterior para de funcionar. Só o dono. */
export class RotateStreamKey {
  constructor(
    private readonly streams: StreamRepository,
    private readonly provider: () => StreamingProvider,
  ) {}

  async execute(actor: LiveActor, streamId: string): Promise<Result<{ rotated: true }, DomainError>> {
    const stream = await this.streams.findById(streamId);
    if (!stream) return err(new NotFoundError("Transmissão"));
    if (stream.ownerId !== actor.id) return err(new ForbiddenError("Só o dono da transmissão troca a chave."));

    const { streamKey } = await this.provider().resetStreamKey(stream.providerStreamId);
    if (!(await this.streams.saveKey(actor.id, stream.id, streamKey))) return err(new ForbiddenError("Só o dono da transmissão troca a chave."));
    return ok({ rotated: true });
  }
}

/** Mostra a chave só ao dono (o banco confere de novo com RLS). Nem o admin vê. */
export class RevealStreamKey {
  constructor(private readonly streams: StreamRepository) {}

  async execute(actor: LiveActor, streamId: string): Promise<Result<{ streamKey: string }, DomainError>> {
    const stream = await this.streams.findById(streamId);
    if (!stream || stream.ownerId !== actor.id) return err(new NotFoundError("Transmissão"));
    const streamKey = await this.streams.keyFor(actor.id, stream.id);
    return streamKey ? ok({ streamKey }) : err(new NotFoundError("Transmissão"));
  }
}

export type LiveTargetView = StreamTarget & {
  label: string;
  href: string;
  stream: { id: string; status: StreamStatus } | null;
};

export type LivePortalView = { ingestUrl: string; simulated: boolean; targets: LiveTargetView[] };

/** Portal /parceiro/live: lugares e eventos do parceiro, com a transmissão de cada um (sem a chave). */
export class ListLiveTargets {
  constructor(
    private readonly streams: StreamRepository,
    private readonly targets: StreamTargets,
    private readonly provider: () => StreamingProvider,
  ) {}

  async execute(actor: LiveActor): Promise<LivePortalView> {
    const provider = this.provider();
    const [options, mine] = await Promise.all([this.targets.optionsFor(actor.id), this.streams.listByOwner(actor.id)]);
    const byTarget = new Map(mine.map((s) => [`${s.entityType}:${s.entityId}`, s]));
    return {
      ingestUrl: provider.ingestUrl,
      simulated: provider.name === "fake",
      targets: options.map((o) => {
        const stream = byTarget.get(`${o.entityType}:${o.entityId}`);
        return { ...o, stream: stream ? { id: stream.id, status: stream.status } : null };
      }),
    };
  }
}
