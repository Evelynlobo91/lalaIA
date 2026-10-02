import { describe, expect, it, vi } from "vitest";
import type { DomainEventPublisher } from "@/shared/events";
import { NotFoundError } from "@/shared/kernel";
import type { FavoriteRepository, FavoriteTargets } from "../../domain/favorite";
import { favToggleSchema } from "./fav-toggle.schema";
import { ToggleFavorite } from "./fav-toggle.use-case";

const PLACE = "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f";
const USER = "1b2c3d4e-0000-4000-8000-000000000001";

function setup({ exists = true, added = true } = {}) {
  const repo: FavoriteRepository = {
    add: vi.fn().mockResolvedValue(added),
    remove: vi.fn().mockResolvedValue(true),
    has: vi.fn(),
    listByUser: vi.fn(),
  };
  const targets: FavoriteTargets = {
    place: { exists: vi.fn().mockResolvedValue(exists) },
    event: { exists: vi.fn().mockResolvedValue(exists) },
  };
  const events: DomainEventPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
  return { repo, targets, events, useCase: new ToggleFavorite(repo, targets, events) };
}

describe("favToggleSchema", () => {
  it("converte o estado desejado em booleano", () => {
    expect(favToggleSchema.parse({ entityType: "place", entityId: PLACE, favorite: "true" })).toEqual({ entityType: "place", entityId: PLACE, favorite: true });
    expect(favToggleSchema.parse({ entityType: "event", entityId: PLACE, favorite: "false" }).favorite).toBe(false);
  });

  it.each([
    ["tipo desconhecido", { entityType: "mission" }, "entityType"],
    ["id inválido", { entityId: "123" }, "entityId"],
    ["ação ausente", { favorite: undefined }, "favorite"],
    ["ação inválida", { favorite: "talvez" }, "favorite"],
  ])("recusa %s", (_, patch, field) => {
    const res = favToggleSchema.safeParse({ entityType: "place", entityId: PLACE, favorite: "true", ...patch });
    expect(res.success).toBe(false);
    expect(res.error?.issues.some((i) => i.path[0] === field)).toBe(true);
  });
});

describe("ToggleFavorite", () => {
  it("favorita um item que existe e publica FavoriteAdded", async () => {
    const { repo, targets, events, useCase } = setup();
    const result = await useCase.execute(USER, { entityType: "place", entityId: PLACE, favorite: true });

    expect(result).toEqual({ ok: true, value: { favorited: true } });
    expect(targets.place.exists).toHaveBeenCalledWith(PLACE);
    expect(repo.add).toHaveBeenCalledWith(USER, { entityType: "place", entityId: PLACE });
    expect(events.publish).toHaveBeenCalledWith("favorites.FavoriteAdded", { userId: USER, entityType: "place", entityId: PLACE });
  });

  it("usa o catálogo do tipo do item (evento)", async () => {
    const { targets, useCase } = setup();
    await useCase.execute(USER, { entityType: "event", entityId: PLACE, favorite: true });
    expect(targets.event.exists).toHaveBeenCalledWith(PLACE);
    expect(targets.place.exists).not.toHaveBeenCalled();
  });

  it("é idempotente: favoritar de novo não duplica nem publica outra vez", async () => {
    const { events, useCase } = setup({ added: false });
    const result = await useCase.execute(USER, { entityType: "place", entityId: PLACE, favorite: true });
    expect(result).toEqual({ ok: true, value: { favorited: true } });
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("não favorita item inexistente", async () => {
    const { repo, events, useCase } = setup({ exists: false });
    const result = await useCase.execute(USER, { entityType: "event", entityId: PLACE, favorite: true });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBeInstanceOf(NotFoundError);
    expect(!result.ok && result.error.message).toBe("Evento não encontrado.");
    expect(repo.add).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("desfavorita sem consultar o item (funciona mesmo se ele foi removido) e de forma idempotente", async () => {
    const { repo, targets, events, useCase } = setup({ exists: false });
    vi.mocked(repo.remove).mockResolvedValue(false);
    const result = await useCase.execute(USER, { entityType: "place", entityId: PLACE, favorite: false });
    expect(result).toEqual({ ok: true, value: { favorited: false } });
    expect(repo.remove).toHaveBeenCalledWith(USER, { entityType: "place", entityId: PLACE });
    expect(targets.place.exists).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
});
