import { describe, expect, it, vi } from "vitest";
import type { BackgroundRunner, Interaction } from "../../domain/interaction";
import { trackUiSchema } from "./tracking.schema";
import { TrackInteraction } from "./tracking.use-case";

const now = new Date("2026-10-10T20:00:00Z");
const placeId = "6f1f2a64-2d8e-4c8b-9a51-0d6a1c9b7e01";

/** Guarda as tarefas para provar que nada é gravado antes de "depois da resposta". */
function deferred() {
  const tasks: Array<() => Promise<void>> = [];
  const runner: BackgroundRunner = { run: (task) => void tasks.push(task) };
  return { runner, flush: () => Promise.all(tasks.splice(0).map((t) => t())) };
}

function setup() {
  const store = { record: vi.fn<(i: Interaction) => Promise<void>>().mockResolvedValue(undefined) };
  const bg = deferred();
  return { store, bg, useCase: new TrackInteraction(store, bg.runner, () => now) };
}

describe("TrackInteraction", () => {
  it("visualização da tela: responde na hora e só grava depois", async () => {
    const { store, bg, useCase } = setup();
    const result = useCase.fromUi({ kind: "view", entityType: "place", entityId: placeId });

    expect(result).toEqual({ ok: true, value: { accepted: true } });
    expect(store.record).not.toHaveBeenCalled();

    await bg.flush();
    expect(store.record).toHaveBeenCalledWith({ kind: "view", entityType: "place", entityId: placeId, source: "ui", occurredAt: now });
  });

  it.each([
    ["favorites.FavoriteAdded", { userId: "u", entityType: "event", entityId: placeId }, { kind: "favorite", entityType: "event", entityId: placeId }],
    ["favorites.WantToGoClicked", { userId: null, entityType: "place", entityId: placeId }, { kind: "quero_ir", entityType: "place", entityId: placeId }],
    ["missions.StepCompleted", { userId: "u", missionId: placeId, stepId: "s", xp: 10 }, { kind: "checkin", entityType: "mission", entityId: placeId }],
  ] as const)("evento de domínio %s vira interação sem o usuário", async (type, payload, expected) => {
    const { store, bg, useCase } = setup();
    const occurredAt = new Date("2026-10-10T19:00:00Z");
    useCase.fromDomain({ id: "evt-1", type, occurredAt, payload } as never);
    await bg.flush();

    const recorded = store.record.mock.calls[0]![0];
    expect(recorded).toEqual({ ...expected, source: "domain", eventId: "evt-1", occurredAt });
    expect(JSON.stringify(recorded)).not.toContain('"u"');
  });
});

describe("trackUiSchema", () => {
  it("aceita só view/live_view com id válido", () => {
    expect(trackUiSchema.safeParse({ kind: "view", entityType: "event", entityId: placeId }).success).toBe(true);
    expect(trackUiSchema.safeParse({ kind: "favorite", entityType: "event", entityId: placeId }).success).toBe(false);
    expect(trackUiSchema.safeParse({ kind: "checkin", entityType: "mission", entityId: placeId }).success).toBe(false);
    expect(trackUiSchema.safeParse({ kind: "view", entityType: "place", entityId: "x" }).success).toBe(false);
  });
});

describe("consentimento de métricas (LGPD, #25)", () => {
  it("interação de domínio de quem desligou as métricas não é gravada; de quem consente, sim", async () => {
    const store = { record: vi.fn<(i: Interaction) => Promise<void>>().mockResolvedValue(undefined) };
    const bg = deferred();
    const consent = { allows: vi.fn(async (userId: string) => userId !== "recusou") };
    const useCase = new TrackInteraction(store, bg.runner, () => now, consent);
    const payload = (userId: string | null) => ({ userId, entityType: "place", entityId: placeId });

    useCase.fromDomain({ id: "e1", type: "favorites.FavoriteAdded", occurredAt: now, payload: payload("recusou") } as never);
    useCase.fromDomain({ id: "e2", type: "favorites.FavoriteAdded", occurredAt: now, payload: payload("aceitou") } as never);
    useCase.fromDomain({ id: "e3", type: "favorites.WantToGoClicked", occurredAt: now, payload: payload(null) } as never); // anônimo
    await bg.flush();

    expect(store.record.mock.calls.map(([i]) => (i.source === "domain" ? i.eventId : "")).sort()).toEqual(["e2", "e3"]);
    expect(consent.allows).toHaveBeenCalledTimes(2);
  });
});
