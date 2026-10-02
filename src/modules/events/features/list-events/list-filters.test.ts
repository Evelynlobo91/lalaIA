import { describe, expect, it } from "vitest";
import { eventListHref, eventListQuery, noEventFilters } from "./list-filters";

describe("URL dos filtros da lista", () => {
  it("sem filtro → caminho puro", () => {
    expect(eventListHref(noEventFilters)).toBe("/eventos");
  });

  it("combina data e categorias", () => {
    expect(eventListQuery({ quando: { kind: "hoje" }, categorias: ["shows", "feiras"] })).toBe("quando=hoje&categoria=shows,feiras");
    expect(eventListHref({ quando: { kind: "data", date: "2026-10-12" }, categorias: [] })).toBe("/eventos?quando=2026-10-12");
    expect(eventListHref({ quando: null, categorias: ["teatro"] }, "/x")).toBe("/x?categoria=teatro");
  });
});
