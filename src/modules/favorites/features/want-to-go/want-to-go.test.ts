import { describe, expect, it, vi } from "vitest";
import type { DomainEventPublisher } from "@/shared/events";
import type { FavoriteTargets } from "../../domain/favorite";
import { wantToGoSchema } from "./want-to-go.schema";
import { RecordWantToGo } from "./want-to-go.use-case";

const ID = "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f";

function setup(exists = true) {
  const targets: FavoriteTargets = {
    place: { exists: vi.fn().mockResolvedValue(exists) },
    event: { exists: vi.fn().mockResolvedValue(exists) },
  };
  const events: DomainEventPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
  return { targets, events, useCase: new RecordWantToGo(targets, events) };
}

describe("wantToGoSchema", () => {
  it("aceita só tipo e id; ignora campos extras (nenhum dado pessoal passa)", () => {
    expect(wantToGoSchema.parse({ entityType: "place", entityId: ID, userId: "forjado", email: "x@y.z" })).toEqual({ entityType: "place", entityId: ID });
  });

  it.each([{ entityType: "mission", entityId: ID }, { entityType: "place", entityId: "1" }, {}])("recusa %j", (body) => {
    expect(wantToGoSchema.safeParse(body).success).toBe(false);
  });
});

describe("RecordWantToGo", () => {
  it("publica WantToGoClicked com o usuário logado", async () => {
    const { targets, events, useCase } = setup();
    expect(await useCase.execute("u1", { entityType: "event", entityId: ID })).toEqual({ ok: true, value: null });
    expect(targets.event.exists).toHaveBeenCalledWith(ID);
    expect(events.publish).toHaveBeenCalledWith("favorites.WantToGoClicked", { userId: "u1", entityType: "event", entityId: ID });
  });

  it("anônimo também registra, com userId null", async () => {
    const { events, useCase } = setup();
    await useCase.execute(null, { entityType: "place", entityId: ID });
    expect(events.publish).toHaveBeenCalledWith("favorites.WantToGoClicked", { userId: null, entityType: "place", entityId: ID });
  });

  it("item inexistente não é registrado (não polui a métrica)", async () => {
    const { events, useCase } = setup(false);
    const result = await useCase.execute(null, { entityType: "place", entityId: ID });
    expect(result.ok).toBe(false);
    expect(events.publish).not.toHaveBeenCalled();
  });
});
