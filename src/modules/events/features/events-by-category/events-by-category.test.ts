import { describe, expect, it, vi } from "vitest";
import { ListEvents, listEventsSchema } from "../list-events/list-events";
import { categoryFilterParam, toggleCategory } from "./events-by-category.schema";

describe("categoryFilterParam", () => {
  it("sem valor → nenhuma categoria (todas)", () => {
    expect(categoryFilterParam.parse(undefined)).toEqual([]);
    expect(categoryFilterParam.parse("")).toEqual([]);
  });

  it("uma ou várias, na ordem do catálogo e sem repetir", () => {
    expect(categoryFilterParam.parse("shows")).toEqual(["shows"]);
    expect(categoryFilterParam.parse("feiras, shows,feiras")).toEqual(["shows", "feiras"]);
  });

  it("categoria desconhecida → erro de validação", () => {
    const parsed = categoryFilterParam.safeParse("shows,nao-existe");
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Categoria inválida.");
  });
});

describe("toggleCategory", () => {
  it("liga e desliga mantendo a ordem do catálogo", () => {
    expect(toggleCategory(["feiras"], "shows")).toEqual(["shows", "feiras"]);
    expect(toggleCategory(["shows", "feiras"], "shows")).toEqual(["feiras"]);
    expect(toggleCategory([], "teatro")).toEqual(["teatro"]);
  });
});

describe("ListEvents com categoria (RF16)", () => {
  const now = new Date("2026-10-10T15:00:00Z");
  const reader = { listUpcoming: vi.fn().mockResolvedValue([]) };
  const places = { summaries: vi.fn().mockResolvedValue([]) };

  it("repassa as categorias ao leitor, combinadas com o filtro de data", async () => {
    const input = listEventsSchema.parse({ categoria: "shows,festas", quando: "hoje" });
    await new ListEvents(reader, places, () => now).execute(input);
    const query = reader.listUpcoming.mock.calls.at(-1)![0];
    expect(query.categories).toEqual(["shows", "festas"]);
    expect(query.window).toBeDefined();
  });

  it("sem categoria não restringe", async () => {
    await new ListEvents(reader, places, () => now).execute(listEventsSchema.parse({}));
    expect(reader.listUpcoming.mock.calls.at(-1)![0].categories).toBeUndefined();
  });
});
