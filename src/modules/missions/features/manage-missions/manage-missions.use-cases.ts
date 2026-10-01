import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { MissionDraft, MissionPlaces, MissionRecord, MissionRepository } from "../../domain/mission";

/** Quem cria: o id vem da sessão; `isPartner`/`isAdmin` são conferidos aqui também (não só na action). */
export type MissionAuthor = { id: string; isPartner: boolean; isAdmin: boolean };

const stepsError = (messages: string[]) =>
  err(new ValidationError("Etapas inválidas.", messages.map((message) => ({ path: ["steps"], message }))));

/** RF26 — Criar ou editar missão (parceiro dono, ou admin). */
export class SaveMission {
  constructor(
    private readonly missions: MissionRepository,
    private readonly places: MissionPlaces,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(author: MissionAuthor, missionId: string | undefined, draft: MissionDraft): Promise<Result<MissionRecord, DomainError>> {
    if (!author.isPartner && !author.isAdmin) return err(new ForbiddenError("Só parceiros e administradores criam missões."));

    const placesError = await this.checkPlaces(author, draft);
    if (placesError) return placesError;

    if (!missionId) {
      if (draft.endsAt <= this.now()) return err(new ValidationError("Data no passado.", [{ path: ["endsAt"], message: "O fim da missão precisa estar no futuro." }]));
      return ok(await this.missions.create(author.id, draft));
    }

    const current = await this.missions.findById(missionId);
    if (!current) return err(new NotFoundError("Missão"));
    if (current.ownerId !== author.id && !author.isAdmin) return err(new ForbiddenError("Só quem criou pode editar esta missão."));
    if (current.status === "archived") return err(new BusinessRuleError("mission_archived", "Missão encerrada não pode ser editada."));

    const updated = await this.missions.update(author.id, missionId, draft);
    return updated ? ok(updated) : err(new ForbiddenError("Só quem criou pode editar esta missão."));
  }

  /** Todo lugar precisa existir; parceiro (não admin) só usa lugares que administra. */
  private async checkPlaces(author: MissionAuthor, draft: MissionDraft) {
    const ids = draft.steps.map((s) => s.placeId);
    const existing = new Set((await this.places.summaries(ids)).map((p) => p.id));
    const missing = draft.steps.flatMap((s, i) => (existing.has(s.placeId) ? [] : [`Etapa ${i + 1}: lugar não encontrado.`]));
    if (missing.length) return stepsError(missing);
    if (author.isAdmin) return null;

    const managed = new Set((await this.places.managedBy(author.id)).map((p) => p.id));
    const foreign = draft.steps.flatMap((s, i) => (managed.has(s.placeId) ? [] : [`Etapa ${i + 1}: escolha um lugar que você administra.`]));
    return foreign.length ? stepsError(foreign) : null;
  }
}

/** Encerrar tira a missão da lista pública; quem já aceitou não consegue mais concluir etapas. Idempotente. */
export class ArchiveMission {
  constructor(private readonly missions: MissionRepository) {}

  async execute(author: MissionAuthor, missionId: string): Promise<Result<MissionRecord, DomainError>> {
    const current = await this.missions.findById(missionId);
    if (!current) return err(new NotFoundError("Missão"));
    if (current.ownerId !== author.id && !author.isAdmin) return err(new ForbiddenError("Só quem criou pode encerrar esta missão."));
    if (current.status === "archived") return ok(current);

    const archived = await this.missions.archive(author.id, missionId);
    return archived ? ok(archived) : err(new ForbiddenError("Só quem criou pode encerrar esta missão."));
  }
}
