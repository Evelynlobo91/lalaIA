import { describe, expect, it, vi } from "vitest";
import type { EventDraft, EventRecord, EventRepository } from "../../domain/event";
import { formatPrice } from "../../domain/event";
import { eventSchema } from "./event.schema";
import { CancelEvent, SaveEvent } from "./manage-events.use-cases";

const PLACE = "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f";
const form = (patch: Record<string, string> = {}) => ({
  placeId: PLACE,
  title: "Samba no Centro",
  description: "Roda de samba ao vivo com petiscos.",
  category: "shows",
  startsAt: "2026-10-10T20:00",
  endsAt: "2026-10-10T23:30",
  price: "25,50",
  ...patch,
});

describe("eventSchema", () => {
  it("converte horário de Joinville para UTC e preço para centavos", () => {
    const { draft } = eventSchema.parse(form());
    expect(draft.startsAt.toISOString()).toBe("2026-10-10T23:00:00.000Z");
    expect(draft.priceCents).toBe(2550);
  });

  it.each([
    ["", 0],
    ["0", 0],
    ["R$ 1.250,00", 125000],
    ["30", 3000],
  ])("preço %j → %d centavos", (price, cents) => {
    expect(eventSchema.parse(form({ price })).draft.priceCents).toBe(cents);
  });

  it.each([
    ["término antes do início", { endsAt: "2026-10-10T19:00" }, "endsAt"],
    ["mais de 14 dias", { endsAt: "2026-10-30T20:00" }, "endsAt"],
    ["preço inválido", { price: "vinte" }, "price"],
    ["sem lugar", { placeId: "" }, "placeId"],
    ["data inválida", { startsAt: "amanhã" }, "startsAt"],
  ])("recusa %s", (_, patch, field) => {
    const res = eventSchema.safeParse(form(patch));
    expect(res.success).toBe(false);
    expect(res.error?.issues.some((i) => i.path[0] === field)).toBe(true);
  });

  it("formata o preço", () => {
    expect(formatPrice(0)).toBe("Grátis");
    expect(formatPrice(2550)).toMatch(/A partir de R\$\s?25,50/);
  });
});

describe("SaveEvent / CancelEvent", () => {
  const now = () => new Date("2026-10-01T12:00:00Z");
  const draft: EventDraft = eventSchema.parse(form()).draft;
  const record = (patch: Partial<EventRecord> = {}): EventRecord => ({ ...draft, id: "e1", ownerId: "dono", status: "scheduled", createdAt: now(), ...patch });
  const repo = (patch: Partial<EventRepository> = {}): EventRepository => ({
    findById: vi.fn().mockResolvedValue(record()),
    listByOwner: vi.fn(),
    create: vi.fn().mockResolvedValue(record()),
    update: vi.fn().mockResolvedValue(record()),
    cancel: vi.fn().mockResolvedValue(record({ status: "cancelled" })),
    ...patch,
  });
  const places = (exists = true) => ({ summary: vi.fn().mockResolvedValue(exists ? { id: PLACE, name: "Bar", neighborhood: null } : null) });
  const bus = () => ({ publish: vi.fn().mockResolvedValue(undefined) });
  const dono = { id: "dono", isPartner: true, isAdmin: false };

  it("parceiro cria evento e publica events.EventPublished", async () => {
    const events = repo();
    const b = bus();
    expect((await new SaveEvent(events, places(), b, now).execute(dono, undefined, draft)).ok).toBe(true);
    expect(events.create).toHaveBeenCalledWith("dono", draft);
    expect(b.publish).toHaveBeenCalledWith("events.EventPublished", { eventId: "e1", placeId: PLACE, ownerId: "dono" });
  });

  it("quem não é parceiro nem admin não publica", async () => {
    const events = repo();
    const res = await new SaveEvent(events, places(), bus(), now).execute({ id: "x", isPartner: false, isAdmin: false }, undefined, draft);
    expect(!res.ok && res.error.code).toBe("forbidden");
    expect(events.create).not.toHaveBeenCalled();
  });

  it("lugar inexistente vira erro no campo do lugar", async () => {
    const res = await new SaveEvent(repo(), places(false), bus(), now).execute(dono, undefined, draft);
    expect(!res.ok && res.error.details).toEqual([{ path: ["placeId"], message: "Escolha um lugar da lista." }]);
  });

  it("não cria evento no passado", async () => {
    const late = () => new Date("2026-10-11T12:00:00Z");
    const res = await new SaveEvent(repo(), places(), bus(), late).execute(dono, undefined, draft);
    expect(!res.ok && res.error.details).toEqual([{ path: ["startsAt"], message: "O início não pode estar no passado." }]);
  });

  it.each([
    ["de outra pessoa", record({ ownerId: "outro" }), "forbidden"],
    ["cancelado", record({ status: "cancelled" }), "event_cancelled"],
    ["que já terminou", record({ endsAt: new Date("2026-09-01T00:00:00Z") }), "event_finished"],
  ])("não edita evento %s", async (_, current, code) => {
    const events = repo({ findById: vi.fn().mockResolvedValue(current) });
    const res = await new SaveEvent(events, places(), bus(), now).execute(dono, "e1", draft);
    expect(!res.ok && res.error.code).toBe(code);
    expect(events.update).not.toHaveBeenCalled();
  });

  it("cancelar: só o dono (ou admin); é idempotente", async () => {
    const b = bus();
    expect((await new CancelEvent(repo(), b).execute(dono, "e1")).ok).toBe(true);
    expect(b.publish).toHaveBeenCalledWith("events.EventCancelled", { eventId: "e1" });

    const outro = await new CancelEvent(repo(), bus()).execute({ id: "outro", isPartner: true, isAdmin: false }, "e1");
    expect(!outro.ok && outro.error.code).toBe("forbidden");

    const already = repo({ findById: vi.fn().mockResolvedValue(record({ status: "cancelled" })) });
    expect((await new CancelEvent(already, bus()).execute(dono, "e1")).ok).toBe(true);
    expect(already.cancel).not.toHaveBeenCalled();
  });
});
