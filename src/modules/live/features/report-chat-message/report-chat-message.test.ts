import { describe, expect, it, vi } from "vitest";
import { ListChatReports, ReportChatMessage, ResolveChatReports, reportMessageSchema, resolveReportSchema, type ReportedMessage } from "./report-chat-message.use-case";

const MESSAGE = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const now = new Date("2026-10-02T23:30:00Z");
const moderator = { id: "mod", canModerate: true };
const reported = (patch: Partial<ReportedMessage> = {}): ReportedMessage => ({
  messageId: MESSAGE,
  body: "mensagem ofensiva",
  authorId: "rui",
  createdAt: now,
  entityType: "place",
  entityId: "lugar",
  reports: 2,
  reasons: ["ofensa", "spam"],
  lastReportAt: now,
  ...patch,
});

describe("ReportChatMessage (#193)", () => {
  it("registra a denúncia em nome de quem está logado; repetir não é erro", async () => {
    const report = vi.fn().mockResolvedValueOnce("created").mockResolvedValueOnce("duplicate");
    const useCase = new ReportChatMessage({ report });
    expect(await useCase.execute({ id: "leo" }, MESSAGE, "ofensa")).toEqual({ ok: true, value: { messageId: MESSAGE } });
    expect(report).toHaveBeenCalledWith("leo", MESSAGE, "ofensa");
    expect((await useCase.execute({ id: "leo" }, MESSAGE, "ofensa")).ok).toBe(true);
  });

  it("mensagem apagada, inexistente ou da própria pessoa não pode ser denunciada", async () => {
    const result = await new ReportChatMessage({ report: async () => "unavailable" }).execute({ id: "leo" }, MESSAGE, "spam");
    expect(!result.ok && result.error.code).toBe("message_unavailable");
  });

  it("schemas: motivo e saída conhecidos", () => {
    expect(reportMessageSchema.safeParse({ messageId: MESSAGE, reason: "assedio" }).success).toBe(true);
    expect(reportMessageSchema.safeParse({ messageId: MESSAGE, reason: "não gostei" }).success).toBe(false);
    expect(resolveReportSchema.safeParse({ messageId: MESSAGE, intent: "keep" }).success).toBe(true);
    expect(resolveReportSchema.safeParse({ messageId: MESSAGE, intent: "ban" }).success).toBe(false);
  });
});

describe("ListChatReports", () => {
  it("fila da moderação com o nome de quem escreveu, sem o id; conta excluída vira 'Usuário removido'", async () => {
    const listOpen = vi.fn().mockResolvedValue([reported(), reported({ messageId: "m2", authorId: null })]);
    const names = vi.fn().mockResolvedValue(new Map([["rui", "Rui Chato"]]));
    const result = await new ListChatReports({ listOpen }, names).execute(moderator);
    expect(result.ok && result.value.map((r) => [r.messageId, r.authorName, r.reports])).toEqual([
      [MESSAGE, "Rui Chato", 2],
      ["m2", "Usuário removido", 2],
    ]);
    expect(result.ok && result.value[0]).not.toHaveProperty("authorId");
    expect(listOpen).toHaveBeenCalledWith("mod", 50);
    expect(names).toHaveBeenCalledWith(["rui"]);
  });

  it("sem a capacidade de moderar, nem consulta", async () => {
    const listOpen = vi.fn();
    const result = await new ListChatReports({ listOpen }, vi.fn()).execute({ id: "leo", canModerate: false });
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(listOpen).not.toHaveBeenCalled();
  });
});

describe("ResolveChatReports", () => {
  const deps = (resolved = 2) => {
    const resolve = vi.fn().mockResolvedValue(resolved);
    const remove = vi.fn().mockResolvedValue(true);
    const events = { publish: vi.fn().mockResolvedValue(undefined) };
    return { resolve, remove, events, useCase: new ResolveChatReports({ resolve }, { remove }, events) };
  };

  it("apagar: tira a mensagem do chat, fecha as denúncias e registra para a auditoria", async () => {
    const { resolve, remove, events, useCase } = deps();
    expect(await useCase.execute(moderator, MESSAGE, "remove")).toEqual({ ok: true, value: { messageId: MESSAGE, resolved: 2 } });
    expect(remove).toHaveBeenCalledWith("mod", MESSAGE);
    expect(resolve).toHaveBeenCalledWith("mod", MESSAGE, "removed");
    expect(events.publish).toHaveBeenCalledWith("live.ChatReportResolved", { messageId: MESSAGE, resolvedBy: "mod", resolution: "removed" });
  });

  it("manter: só fecha as denúncias (a mensagem fica)", async () => {
    const { resolve, remove, events, useCase } = deps();
    expect((await useCase.execute(moderator, MESSAGE, "keep")).ok).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith("mod", MESSAGE, "kept");
    expect(events.publish).toHaveBeenCalledWith("live.ChatReportResolved", expect.objectContaining({ resolution: "kept" }));
  });

  it("sem denúncia em aberto → não encontrado, sem evento; sem a capacidade → recusa sem tocar em nada", async () => {
    const none = deps(0);
    const r1 = await none.useCase.execute(moderator, MESSAGE, "keep");
    expect(!r1.ok && r1.error.code).toBe("not_found");
    expect(none.events.publish).not.toHaveBeenCalled();

    const denied = deps();
    const r2 = await denied.useCase.execute({ id: "leo", canModerate: false }, MESSAGE, "remove");
    expect(!r2.ok && r2.error.code).toBe("forbidden");
    expect(denied.remove).not.toHaveBeenCalled();
    expect(denied.resolve).not.toHaveBeenCalled();
  });
});
