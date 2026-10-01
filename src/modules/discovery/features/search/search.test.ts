import { describe, expect, it, vi } from "vitest";
import { ValidationError, err, ok } from "@/shared/kernel";
import { exclude, type SearchFilter, type SearchHit } from "../../domain/search";
import { EventsSearchSource, PlacesSearchSource, eventHit, placeHit } from "../../infra/module-search-sources";
import { searchSchema } from "./search.schema";
import { firstValues, toQueryString } from "./search-url";
import { Search } from "./search.use-case";

const hit = (id: string): SearchHit => ({ id, href: `/x/${id}`, title: id, categoryLabel: "Bares", where: null, when: null, badge: null });
const sources = () => ({
  places: { search: vi.fn().mockResolvedValue(ok({ items: [hit("p1")], nextCursor: "cp" })) },
  events: { search: vi.fn().mockResolvedValue(ok({ items: [hit("e1")], nextCursor: null })) },
});

describe("Search (busca unificada)", () => {
  it("pergunta aos dois módulos com o mesmo texto e agrupa por tipo, cada grupo com seu cursor", async () => {
    const { places, events } = sources();
    const res = await new Search(places, events).execute({ text: "samba", kind: null, cursor: null, limit: 6 });

    expect(places.search).toHaveBeenCalledWith({ text: "samba" }, { cursor: null, limit: 6 });
    expect(events.search).toHaveBeenCalledWith({ text: "samba" }, { cursor: null, limit: 6 });
    expect(res.ok && res.value.groups.map((g) => [g.kind, g.items.map((i) => i.id), g.nextCursor, g.excluded])).toEqual([
      ["lugares", ["p1"], "cp", null],
      ["eventos", ["e1"], null, null],
    ]);
  });

  it("com tipo (aba ou 'carregar mais') consulta só aquele módulo, com o cursor dele", async () => {
    const { places, events } = sources();
    const res = await new Search(places, events).execute({ text: "bar", kind: "lugares", cursor: "cp", limit: 20 });

    expect(places.search).toHaveBeenCalledWith({ text: "bar" }, { cursor: "cp", limit: 20 });
    expect(events.search).not.toHaveBeenCalled();
    expect(res.ok && res.value.groups.map((g) => g.kind)).toEqual(["lugares"]);
  });

  it("filtros (estratégias) restringem cada tipo em sequência; um filtro pode tirar um tipo da busca", async () => {
    const { places, events } = sources();
    const onlyEvents: SearchFilter = { places: () => exclude("Lugares não têm preço."), events: (c) => ({ ...c, text: `${c.text}!` }) };
    const res = await new Search(places, events).execute({ text: "x", kind: null, cursor: null, limit: 6 }, [onlyEvents]);

    expect(places.search).not.toHaveBeenCalled();
    expect(events.search).toHaveBeenCalledWith({ text: "x!" }, { cursor: null, limit: 6 });
    expect(res.ok && res.value.groups[0]).toEqual({ kind: "lugares", items: [], nextCursor: null, excluded: "Lugares não têm preço." });
  });

  it("erro de um módulo (ex.: cursor adulterado) vira o erro da busca", async () => {
    const { places, events } = sources();
    places.search.mockResolvedValue(err(new ValidationError("Cursor inválido.")));
    const res = await new Search(places, events).execute({ text: "x", kind: "lugares", cursor: "lixo", limit: 20 });
    expect(!res.ok && res.error.message).toBe("Cursor inválido.");
  });
});

describe("searchSchema", () => {
  it("texto (pelo menos 2 letras) ou algum filtro; tamanho da página depende do tipo", () => {
    expect(searchSchema.safeParse({}).error?.issues[0]?.message).toBe("Digite o que você procura ou escolha um filtro.");
    expect(searchSchema.safeParse({ q: " a " }).error?.issues[0]?.message).toBe("Digite pelo menos 2 letras.");
    expect(searchSchema.parse({ q: " açaí " })).toMatchObject({ q: "açaí", tipo: null, cursor: null, limit: 6 });
    expect(searchSchema.parse({ preco: "gratis" })).toMatchObject({ q: null, preco: "gratis" });
    expect(searchSchema.parse({ q: "bar", tipo: "eventos" }).limit).toBe(20);
  });

  it("recusa tipo desconhecido, texto longo e cursor sem tipo", () => {
    expect(searchSchema.safeParse({ q: "bar", tipo: "pessoas" }).success).toBe(false);
    expect(searchSchema.safeParse({ q: "x".repeat(81) }).success).toBe(false);
    expect(searchSchema.safeParse({ q: "bar", cursor: "abc" }).success).toBe(false);
  });

  it("URL: primeiro valor de cada parâmetro e query string sem vazios", () => {
    expect(firstValues({ q: ["a", "b"], tipo: undefined, x: "1" })).toEqual({ q: "a", x: "1" });
    expect(toQueryString({ q: "café da manhã", tipo: null, bairro: "" })).toBe("q=caf%C3%A9+da+manh%C3%A3");
  });
});

describe("adaptadores para places e events", () => {
  it("lugar vira resultado com bairro e 'aberto agora'", () => {
    const base = { id: "p", name: "Bar do Zé", category: "bares" as const, categoryLabel: "Bares", neighborhood: "Centro" };
    expect(placeHit({ ...base, openNow: true })).toMatchObject({ href: "/lugares/p", title: "Bar do Zé", where: "Centro", badge: { label: "Aberto agora", tone: "success" } });
    expect(placeHit({ ...base, openNow: null }).badge).toBeNull();
  });

  it("evento vira resultado com lugar, quando e preço (ou 'Acontecendo')", () => {
    const base = {
      id: "e",
      title: "Samba",
      category: "shows" as const,
      categoryLabel: "Shows e música",
      placeName: "Teatro",
      neighborhood: null,
      whenLabel: "sáb., 10 de out., 20:00 – 23:00",
      priceLabel: "Grátis",
      startsAt: "2026-10-10T23:00:00.000Z",
    };
    expect(eventHit({ ...base, happeningNow: false })).toMatchObject({ href: "/eventos/e", where: "Teatro", when: base.whenLabel, badge: { label: "Grátis" } });
    expect(eventHit({ ...base, neighborhood: "Centro", happeningNow: true })).toMatchObject({ where: "Teatro · Centro", badge: { tone: "live" } });
  });

  it("repassam critérios + página às APIs públicas dos módulos", async () => {
    const searchPlaces = vi.fn().mockResolvedValue(ok({ items: [], nextCursor: null }));
    const searchEvents = vi.fn().mockResolvedValue(err(new ValidationError("Cursor inválido.")));
    await new PlacesSearchSource(searchPlaces).search({ text: "bar" }, { cursor: "c", limit: 5 });
    expect(searchPlaces).toHaveBeenCalledWith({ text: "bar", cursor: "c", limit: 5 });
    expect((await new EventsSearchSource(searchEvents).search({ text: "x" }, { cursor: null, limit: 5 })).ok).toBe(false);
  });
});
