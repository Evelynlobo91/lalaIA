import { ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { LiveActor, LiveTargetDirectory, LiveTargetInfo, StreamNoteStore, StreamRecord, StreamRepository, StreamTarget } from "../../domain/stream";

const notAllowed = () => err(new ForbiddenError("Só o responsável pela transmissão (ou um administrador) muda a situação atual."));

/** RF21 — O parceiro atualiza a situação atual da live (ex.: "Casa cheia"). Dono ou admin. */
export class UpdateStreamNote {
  constructor(
    private readonly streams: Pick<StreamRepository, "findById">,
    private readonly notes: StreamNoteStore,
  ) {}

  async execute(actor: LiveActor, streamId: string, note: string | null): Promise<Result<StreamRecord, DomainError>> {
    const stream = await this.streams.findById(streamId);
    if (!stream) return err(new NotFoundError("Transmissão"));
    if (stream.ownerId !== actor.id && !actor.isAdmin) return notAllowed();
    if (stream.note === note) return ok(stream);
    const updated = await this.notes.setNote(actor.id, stream.id, note);
    return updated ? ok(updated) : notAllowed();
  }
}

/** RF21 — Evento, lugar e horário para mostrar junto do player (APIs públicas de places/events). */
export class GetStreamContext {
  constructor(private readonly directory: LiveTargetDirectory) {}

  async execute(target: StreamTarget): Promise<LiveTargetInfo | null> {
    const [info] = await this.directory.describe([target]);
    return info ?? null;
  }
}

/** "há 12 min", "há 1 h 05 min" (há quanto tempo está ao vivo). Menos de 1 min: "agora há pouco". */
export function liveForLabel(since: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
  if (minutes < 1) return "agora há pouco";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `há ${hours} h` : `há ${hours} h ${String(rest).padStart(2, "0")} min`;
}
