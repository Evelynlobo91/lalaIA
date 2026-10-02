import { describe, expect, it, vi } from "vitest";
import { formatDay, isOverdue, type FollowUp } from "../../domain/follow-up";
import { AddLeadNote, CompleteFollowUp, GetLeadActivity, ListMyFollowUps, SetNextStep, nextStepSchema, noteSchema } from "./follow-ups.use-cases";

const LEAD = "9c1e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b91";
const today = () => "2026-10-02";
const writer = { id: "ana", canRead: true, canWrite: true };
const reader = { id: "bia", canRead: true, canWrite: false };
const outsider = { id: "x", canRead: false, canWrite: false };
const followUp = (patch: Partial<FollowUp> = {}): FollowUp => ({ id: "f1", leadId: LEAD, description: "Ligar para o José", dueOn: "2026-10-02", doneAt: null, ...patch });

describe("datas", () => {
  it("atrasado é só quando o dia já passou; hoje não é atraso", () => {
    expect(isOverdue("2026-10-01", "2026-10-02")).toBe(true);
    expect(isOverdue("2026-10-02", "2026-10-02")).toBe(false);
    expect(isOverdue("2026-10-03", "2026-10-02")).toBe(false);
  });

  it("formata o dia em português", () => {
    expect(formatDay("2026-10-02")).toBe("02/10/2026");
  });
});

describe("schemas", () => {
  it("anotação aparada, de 2 a 2000 caracteres", () => {
    expect(noteSchema.parse({ leadId: LEAD, body: "  Ligou e pediu proposta.  " }).body).toBe("Ligou e pediu proposta.");
    expect(noteSchema.safeParse({ leadId: LEAD, body: " " }).success).toBe(false);
    expect(noteSchema.safeParse({ leadId: LEAD, body: "x".repeat(2001) }).success).toBe(false);
  });

  it("próximo passo exige descrição e uma data de calendário válida", () => {
    expect(nextStepSchema.safeParse({ leadId: LEAD, description: "Ligar", dueOn: "2026-10-05" }).success).toBe(true);
    expect(nextStepSchema.safeParse({ leadId: LEAD, description: "Ligar", dueOn: "2026-02-31" }).success).toBe(false);
    expect(nextStepSchema.safeParse({ leadId: LEAD, description: "Ligar", dueOn: "" }).success).toBe(false);
    expect(nextStepSchema.safeParse({ leadId: LEAD, description: "", dueOn: "2026-10-05" }).success).toBe(false);
  });
});

describe("AddLeadNote", () => {
  it("anota em nome de quem age; lead inexistente → não encontrado; quem só lê não anota", async () => {
    const addNote = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await new AddLeadNote({ addNote }).execute(writer, LEAD, "Ligou.")).ok).toBe(true);
    expect(addNote).toHaveBeenCalledWith("ana", LEAD, "Ligou.");
    const missing = await new AddLeadNote({ addNote }).execute(writer, LEAD, "Ligou.");
    expect(!missing.ok && missing.error.code).toBe("not_found");

    const forbidden = await new AddLeadNote({ addNote }).execute(reader, LEAD, "Ligou.");
    expect(!forbidden.ok && forbidden.error.code).toBe("forbidden");
    expect(addNote).toHaveBeenCalledTimes(2);
  });
});

describe("SetNextStep", () => {
  it("aceita hoje e o futuro; recusa data no passado sem gravar", async () => {
    const setNextStep = vi.fn().mockResolvedValue(followUp());
    const useCase = new SetNextStep({ setNextStep }, today);
    expect((await useCase.execute(writer, { leadId: LEAD, description: "Ligar", dueOn: "2026-10-02" })).ok).toBe(true);
    expect((await useCase.execute(writer, { leadId: LEAD, description: "Ligar", dueOn: "2026-11-01" })).ok).toBe(true);

    const past = await useCase.execute(writer, { leadId: LEAD, description: "Ligar", dueOn: "2026-10-01" });
    expect(!past.ok && past.error.code).toBe("validation_failed");
    expect(setNextStep).toHaveBeenCalledTimes(2);
  });

  it("quem só lê não define próximo passo", async () => {
    const setNextStep = vi.fn();
    expect((await new SetNextStep({ setNextStep }, today).execute(reader, { leadId: LEAD, description: "Ligar", dueOn: "2026-10-05" })).ok).toBe(false);
    expect(setNextStep).not.toHaveBeenCalled();
  });
});

describe("CompleteFollowUp", () => {
  it("conclui; já concluído ou inexistente → não encontrado", async () => {
    const complete = vi.fn().mockResolvedValueOnce(followUp({ doneAt: new Date() })).mockResolvedValueOnce(null);
    expect((await new CompleteFollowUp({ complete }).execute(writer, "f1")).ok).toBe(true);
    const again = await new CompleteFollowUp({ complete }).execute(writer, "f1");
    expect(!again.ok && again.error.code).toBe("not_found");
  });
});

describe("GetLeadActivity", () => {
  it("traz o próximo passo com o atraso e as anotações com o nome de quem escreveu", async () => {
    const activity = {
      notes: vi.fn().mockResolvedValue([
        { id: "2", body: "Pediu proposta.", authorId: "ana", createdAt: new Date() },
        { id: "1", body: "Primeiro contato.", authorId: null, createdAt: new Date() },
      ]),
      openFollowUp: vi.fn().mockResolvedValue(followUp({ dueOn: "2026-09-30" })),
    };
    const result = await new GetLeadActivity(activity, vi.fn().mockResolvedValue(new Map([["ana", "Ana Comercial"]])), today).execute(reader, LEAD);
    expect(result.ok && result.value.nextStep).toMatchObject({ description: "Ligar para o José", overdue: true });
    expect(result.ok && result.value.notes.map((n) => n.authorName)).toEqual(["Ana Comercial", "Conta removida"]);
  });

  it("quem não tem acesso ao CRM não vê nada", async () => {
    const activity = { notes: vi.fn(), openFollowUp: vi.fn() };
    expect((await new GetLeadActivity(activity, vi.fn(), today).execute(outsider, LEAD)).ok).toBe(false);
    expect(activity.notes).not.toHaveBeenCalled();
  });
});

describe("ListMyFollowUps", () => {
  it("pede os follow-ups até hoje dos leads de quem pergunta e marca os atrasados", async () => {
    const lead = { businessName: "Bar do Zé", contactName: "José", contactPhone: "47999990000" };
    const dueFor = vi.fn().mockResolvedValue([
      { ...followUp({ id: "f0", dueOn: "2026-09-29" }), ...lead },
      { ...followUp({ id: "f1", dueOn: "2026-10-02" }), ...lead },
    ]);
    const result = await new ListMyFollowUps({ dueFor }, today).execute(writer);
    expect(dueFor).toHaveBeenCalledWith("ana", "ana", "2026-10-02");
    expect(result.ok && result.value.map((f) => [f.id, f.overdue])).toEqual([
      ["f0", true],
      ["f1", false],
    ]);
  });
});
