import { z } from "zod";
import { ForbiddenError, NotFoundError, ValidationError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { isOverdue, type DueFollowUp, type FollowUp, type LeadActivity, type LeadNote } from "../../domain/follow-up";
import type { CrmActor } from "../../domain/lead";

export const noteSchema = z.object({
  leadId: z.uuid(),
  body: z.string().trim().min(2, "Escreva a anotação.").max(2000, "Use no máximo 2000 caracteres."),
});

export const nextStepSchema = z.object({
  leadId: z.uuid(),
  description: z.string().trim().min(2, "Diga qual é o próximo passo.").max(200, "Use no máximo 200 caracteres."),
  dueOn: z.iso.date({ error: "Informe a data." }),
});

export const completeSchema = z.object({ followUpId: z.uuid() });

/** Registra uma anotação no lead (#149). */
export class AddLeadNote {
  constructor(private readonly activity: Pick<LeadActivity, "addNote">) {}

  async execute(actor: CrmActor, leadId: string, body: string): Promise<Result<{ leadId: string }, DomainError>> {
    if (!actor.canWrite) return err(new ForbiddenError());
    return (await this.activity.addNote(actor.id, leadId, body)) ? ok({ leadId }) : err(new NotFoundError("Lead"));
  }
}

/** Define o próximo passo com data. A data não pode estar no passado (calendário de Joinville). */
export class SetNextStep {
  constructor(
    private readonly activity: Pick<LeadActivity, "setNextStep">,
    private readonly today: () => string,
  ) {}

  async execute(actor: CrmActor, input: { leadId: string; description: string; dueOn: string }): Promise<Result<FollowUp, DomainError>> {
    if (!actor.canWrite) return err(new ForbiddenError());
    if (input.dueOn < this.today()) return err(new ValidationError("Data no passado.", [{ path: ["dueOn"], message: "Escolha hoje ou um dia futuro." }]));
    const followUp = await this.activity.setNextStep(actor.id, input.leadId, input.description, input.dueOn);
    return followUp ? ok(followUp) : err(new NotFoundError("Lead"));
  }
}

/** Conclui um follow-up: ele sai da lista de pendências. Concluir de novo não tem efeito. */
export class CompleteFollowUp {
  constructor(private readonly activity: Pick<LeadActivity, "complete">) {}

  async execute(actor: CrmActor, followUpId: string): Promise<Result<FollowUp, DomainError>> {
    if (!actor.canWrite) return err(new ForbiddenError());
    const done = await this.activity.complete(actor.id, followUpId);
    return done ? ok(done) : err(new NotFoundError("Follow-up"));
  }
}

export type LeadNoteView = LeadNote & { authorName: string };
export type LeadActivityView = { nextStep: (FollowUp & { overdue: boolean }) | null; notes: LeadNoteView[] };

/** Próximo passo em aberto e anotações de um lead, para a página dele. */
export class GetLeadActivity {
  constructor(
    private readonly activity: Pick<LeadActivity, "notes" | "openFollowUp">,
    private readonly names: (ids: string[]) => Promise<Map<string, string>>,
    private readonly today: () => string,
  ) {}

  async execute(actor: CrmActor, leadId: string): Promise<Result<LeadActivityView, DomainError>> {
    if (!actor.canRead) return err(new ForbiddenError());
    const [notes, open] = await Promise.all([this.activity.notes(actor.id, leadId), this.activity.openFollowUp(actor.id, leadId)]);
    const names = await this.names([...new Set(notes.flatMap((n) => (n.authorId ? [n.authorId] : [])))]);
    return ok({
      nextStep: open ? { ...open, overdue: isOverdue(open.dueOn, this.today()) } : null,
      notes: notes.map((n) => ({ ...n, authorName: n.authorId ? (names.get(n.authorId) ?? "Conta removida") : "Conta removida" })),
    });
  }
}

export type MyFollowUp = DueFollowUp & { overdue: boolean };

/** "Meus follow-ups de hoje": os de hoje e os atrasados, dos leads sob responsabilidade de quem pergunta. */
export class ListMyFollowUps {
  constructor(
    private readonly activity: Pick<LeadActivity, "dueFor">,
    private readonly today: () => string,
  ) {}

  async execute(actor: CrmActor): Promise<Result<MyFollowUp[], DomainError>> {
    if (!actor.canRead) return err(new ForbiddenError());
    const today = this.today();
    const due = await this.activity.dueFor(actor.id, actor.id, today);
    return ok(due.map((f) => ({ ...f, overdue: isOverdue(f.dueOn, today) })));
  }
}
