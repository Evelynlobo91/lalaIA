import { describe, expect, it, vi } from "vitest";
import type { DomainEvent, DomainEventMap } from "@/shared/events";
import type { AuditEntry } from "../../domain/audit";
import { actionLabel, actionOf, auditActions, auditedEventTypes, auditedEvents } from "./audit-events";
import { AUDIT_PAGE_SIZE, ListAuditLog, RecordAudit, auditFilterSchema } from "./audit-log.use-cases";

const ADMIN = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const now = new Date("2026-10-02T12:00:00Z");

const event = <K extends keyof DomainEventMap>(type: K, payload: DomainEventMap[K]): DomainEvent<DomainEventMap, K> => ({ id: "evt-1", type, payload, occurredAt: now });

const entry = (patch: Partial<AuditEntry> = {}): AuditEntry => ({
  eventId: "evt-1",
  actorId: ADMIN,
  action: "partners.partner_suspended",
  targetType: "partner",
  targetId: "p1",
  occurredAt: now,
  ...patch,
});

describe("catálogo de eventos auditados", () => {
  it("o nome da ação é o tipo do evento em minúsculas, no formato aceito pelo banco", () => {
    expect(actionOf("partners.PartnerSuspended")).toBe("partners.partner_suspended");
    expect(actionOf("places.PlaceCreatedByAdmin")).toBe("places.place_created_by_admin");
    for (const type of auditedEventTypes) expect(actionOf(type)).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
  });

  it("toda ação tem um texto para a tela, sem repetição", () => {
    expect(new Set(auditActions.map((a) => a.action)).size).toBe(auditedEventTypes.length);
    expect(new Set(auditActions.map((a) => a.label)).size).toBe(auditedEventTypes.length);
    expect(actionLabel("partners.partner_suspended")).toBe(auditedEvents["partners.PartnerSuspended"].label);
  });

  it("ação que saiu do catálogo aparece pelo nome gravado", () => {
    expect(actionLabel("antigo.acao_removida")).toBe("antigo.acao_removida");
  });
});

describe("RecordAudit", () => {
  it("grava quem agiu, a ação e o alvo a partir do evento", async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    await new RecordAudit({ append }).fromEvent(event("partners.PartnerSuspended", { partnerId: "p1", userId: "dono", suspendedBy: ADMIN }));
    expect(append).toHaveBeenCalledWith(entry());
  });

  it("o alvo de uma edição pelo admin é a entidade editada", async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    await new RecordAudit({ append }).fromEvent(event("events.EventEditedByAdmin", { eventId: "e1", editedBy: ADMIN }));
    expect(append).toHaveBeenCalledWith(entry({ action: "events.event_edited_by_admin", targetType: "event", targetId: "e1" }));
  });
});

describe("auditFilterSchema", () => {
  it("valores inválidos caem no padrão", () => {
    expect(auditFilterSchema.parse({ periodo: "15", acao: "inventada", quem: "não-é-uuid" })).toEqual({ periodo: 30, acao: undefined, quem: undefined });
    expect(auditFilterSchema.parse({})).toEqual({ periodo: 30 });
  });

  it("aceita período, ação e pessoa válidos; parâmetro repetido usa o primeiro", () => {
    expect(auditFilterSchema.parse({ periodo: ["7", "90"], acao: "partners.partner_suspended", quem: ADMIN })).toEqual({ periodo: 7, acao: "partners.partner_suspended", quem: ADMIN });
  });

  it("filtro vazio do formulário vale como sem filtro", () => {
    expect(auditFilterSchema.parse({ periodo: "90", acao: "", quem: "" })).toEqual({ periodo: 90, acao: undefined, quem: undefined });
  });
});

describe("ListAuditLog", () => {
  const actors = { names: vi.fn().mockResolvedValue(new Map([[ADMIN, "Ana Admin"]])) };

  it("só admin consulta; quem não é nem chega ao banco", async () => {
    const list = vi.fn();
    const result = await new ListAuditLog({ list }, actors, () => now).execute({ isAdmin: false }, {});
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(list).not.toHaveBeenCalled();
  });

  it("aplica período e ação, e mostra o nome de quem agiu", async () => {
    const list = vi.fn().mockResolvedValue([entry()]);
    const result = await new ListAuditLog({ list }, actors, () => now).execute({ isAdmin: true }, { periodo: "7", acao: "partners.partner_suspended" });

    expect(list).toHaveBeenCalledWith({ action: "partners.partner_suspended", actorId: undefined, since: new Date("2026-09-25T12:00:00Z"), limit: AUDIT_PAGE_SIZE + 1 });
    expect(result.ok && result.value.rows[0]).toMatchObject({ actorName: "Ana Admin", actionLabel: "Suspendeu o parceiro", targetType: "partner", targetId: "p1" });
    expect(result.ok && result.value.actors).toEqual([{ id: ADMIN, name: "Ana Admin" }]);
    expect(result.ok && result.value.truncated).toBe(false);
  });

  it("conta excluída aparece como 'Conta removida'", async () => {
    const list = vi.fn().mockResolvedValue([entry({ actorId: "apagado" })]);
    const result = await new ListAuditLog({ list }, { names: vi.fn().mockResolvedValue(new Map()) }, () => now).execute({ isAdmin: true }, {});
    expect(result.ok && result.value.rows[0].actorName).toBe("Conta removida");
  });

  it("avisa quando há mais registros do que a página mostra", async () => {
    const many = Array.from({ length: AUDIT_PAGE_SIZE + 1 }, (_, i) => entry({ eventId: `evt-${i}` }));
    const result = await new ListAuditLog({ list: vi.fn().mockResolvedValue(many) }, actors, () => now).execute({ isAdmin: true }, {});
    expect(result.ok && result.value.rows).toHaveLength(AUDIT_PAGE_SIZE);
    expect(result.ok && result.value.truncated).toBe(true);
  });

  it("com filtro de pessoa, a lista de pessoas continua sendo a do período", async () => {
    const other = "9c1e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b91";
    const list = vi
      .fn()
      .mockResolvedValueOnce([entry()])
      .mockResolvedValueOnce([entry(), entry({ eventId: "evt-2", actorId: other })]);
    const names = vi.fn().mockResolvedValue(new Map([[ADMIN, "Ana Admin"], [other, "Bia Admin"]]));
    const result = await new ListAuditLog({ list }, { names }, () => now).execute({ isAdmin: true }, { quem: ADMIN });
    expect(result.ok && result.value.rows).toHaveLength(1);
    expect(result.ok && result.value.actors.map((a) => a.name)).toEqual(["Ana Admin", "Bia Admin"]);
  });
});
