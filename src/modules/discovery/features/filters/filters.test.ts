import { describe, expect, it, vi } from "vitest";
import { ok } from "@/shared/kernel";
import { timePeriods } from "../../domain/time-of-day";
import { Search } from "../search/search.use-case";
import { describeFilters, filtersSchema, filtersToParams, hasFilters, normalizeFilterParams } from "./filters.schema";
import { CategoryFilter, NeighborhoodFilter, PRICE_EXCLUDES_PLACES, PriceFilter, SearchFilterFactory, TimeFilter } from "./filters.strategies";
import { GetFilterOptions } from "./filters.use-case";

// Quarta, 07/10/2026, 13:00 em Joinville (UTC-3).
const now = new Date("2026-10-07T16:00:00Z");
const z = (iso: string) => new Date(`${iso}Z`);

describe("timePeriods (data + horário, no calendário de Joinville)", () => {
  it("sem data nem horário: sem filtro de tempo", () => {
    expect(timePeriods(null, null, now)).toBeNull();
  });

  it("só data: o período da data, a partir de agora", () => {
    const hoje = { from: z("2026-10-07T03:00:00"), to: z("2026-10-08T03:00:00") };
    expect(timePeriods(hoje, null, now)).toEqual([{ from: now, to: hoje.to }]);
  });

  it("só horário: hoje (a noite vai até as 6h de amanhã); o que já passou sai", () => {
    expect(timePeriods(null, "noite", now)).toEqual([{ from: z("2026-10-07T21:00:00"), to: z("2026-10-08T09:00:00") }]);
    expect(timePeriods(null, "tarde", now)).toEqual([{ from: now, to: z("2026-10-07T21:00:00") }]);
    expect(timePeriods(null, "manha", now)).toEqual([]);
  });

  it("de madrugada, 'noite' inclui o resto da noite de ontem", () => {
    const madrugada = new Date("2026-10-08T05:00:00Z"); // 02:00 de quinta
    expect(timePeriods(null, "noite", madrugada)?.[0]).toEqual({ from: madrugada, to: z("2026-10-08T09:00:00") });
  });

  it("data + horário: o horário em cada dia da data (fim de semana à noite = sábado e domingo)", () => {
    const fds = { from: z("2026-10-10T03:00:00"), to: z("2026-10-12T03:00:00") };
    expect(timePeriods(fds, "noite", now)).toEqual([
      { from: z("2026-10-10T21:00:00"), to: z("2026-10-11T09:00:00") },
      { from: z("2026-10-11T21:00:00"), to: z("2026-10-12T09:00:00") },
    ]);
  });

  it("'agora' é o instante atual; com uma data que não inclui agora, nada", () => {
    expect(timePeriods(null, "agora", now)).toEqual([{ from: now, to: now }]);
    const amanha = { from: z("2026-10-08T03:00:00"), to: z("2026-10-09T03:00:00") };
    expect(timePeriods(amanha, "agora", now)).toEqual([]);
  });
});

describe("estratégias de filtro", () => {
  const base = { text: "samba" };

  it("categoria vale para lugares e eventos", () => {
    const f = new CategoryFilter("shows");
    expect(f.places(base)).toEqual({ text: "samba", category: "shows" });
    expect(f.events(base)).toEqual({ text: "samba", category: "shows" });
  });

  it("bairro: lugares pelo bairro; eventos pelos lugares do bairro (vindos de places)", async () => {
    const places = { placeIdsIn: vi.fn().mockResolvedValue(["l1", "l2"]) };
    const f = new NeighborhoodFilter("Glória", places);
    expect(f.places(base)).toEqual({ text: "samba", neighborhood: "Glória" });
    expect(await f.events(base)).toEqual({ text: "samba", placeIds: ["l1", "l2"] });
    expect(places.placeIdsIn).toHaveBeenCalledWith("Glória");
  });

  it("tempo: lugares abertos no período; eventos que se sobrepõem a ele", () => {
    const periods = [{ from: now, to: now }];
    const f = new TimeFilter(periods);
    expect(f.places(base)).toEqual({ text: "samba", openDuring: periods });
    expect(f.events(base)).toEqual({ text: "samba", periods });
  });

  it("preço: só eventos (lugares saem com o motivo)", () => {
    const f = new PriceFilter("ate-50");
    expect(f.places()).toEqual({ excluded: PRICE_EXCLUDES_PLACES });
    expect(f.events(base)).toEqual({ text: "samba", price: { minCents: 0, maxCents: 5000 } });
    expect(new PriceFilter("acima-100").events(base).price).toEqual({ minCents: 10001, maxCents: null });
  });
});

describe("os 5 filtros combinam na busca", () => {
  it("fábrica + Search: cada módulo recebe todos os filtros que se aplicam a ele", async () => {
    const placeIdsIn = vi.fn().mockResolvedValue(["l1"]);
    const factory = new SearchFilterFactory({ placeIdsIn }, () => now);
    const input = filtersSchema.parse({ categoria: "shows", bairro: "Centro", quando: "fim-de-semana", horario: "noite" });
    const places = { search: vi.fn().mockResolvedValue(ok({ items: [], nextCursor: null })) };
    const events = { search: vi.fn().mockResolvedValue(ok({ items: [], nextCursor: null })) };

    await new Search(places, events).execute({ text: "samba", kind: null, cursor: null, limit: 6 }, factory.from(input));

    const noites = [
      { from: z("2026-10-10T21:00:00"), to: z("2026-10-11T09:00:00") },
      { from: z("2026-10-11T21:00:00"), to: z("2026-10-12T09:00:00") },
    ];
    expect(places.search).toHaveBeenCalledWith({ text: "samba", category: "shows", neighborhood: "Centro", openDuring: noites }, { cursor: null, limit: 6 });
    expect(events.search).toHaveBeenCalledWith({ text: "samba", category: "shows", placeIds: ["l1"], periods: noites }, { cursor: null, limit: 6 });
  });

  it("com preço, os lugares nem são consultados e o grupo explica o porquê", async () => {
    const factory = new SearchFilterFactory({ placeIdsIn: vi.fn() }, () => now);
    const places = { search: vi.fn() };
    const events = { search: vi.fn().mockResolvedValue(ok({ items: [], nextCursor: null })) };
    const res = await new Search(places, events).execute({ text: null, kind: null, cursor: null, limit: 6 }, factory.from({ preco: "gratis", quando: null }));

    expect(places.search).not.toHaveBeenCalled();
    expect(events.search).toHaveBeenCalledWith({ text: null, price: { minCents: 0, maxCents: 0 } }, { cursor: null, limit: 6 });
    expect(res.ok && res.value.groups[0].excluded).toBe(PRICE_EXCLUDES_PLACES);
  });

  it("sem filtros, nenhuma estratégia", () => {
    expect(new SearchFilterFactory({ placeIdsIn: vi.fn() }, () => now).from({ quando: null })).toEqual([]);
  });
});

describe("filtros na URL", () => {
  it("valida cada filtro e recusa valores desconhecidos", () => {
    expect(filtersSchema.parse({ categoria: "bares", bairro: " Glória ", quando: "2026-10-10", horario: "noite", preco: "gratis" })).toEqual({
      categoria: "bares",
      bairro: "Glória",
      quando: { kind: "data", date: "2026-10-10" },
      horario: "noite",
      preco: "gratis",
    });
    for (const bad of [{ categoria: "pessoas" }, { quando: "2026-02-31" }, { horario: "madrugada" }, { preco: "caro" }]) {
      expect(filtersSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("formulário sem JavaScript: campos vazios somem e a data específica vira 'quando'", () => {
    expect(normalizeFilterParams({ q: "x", categoria: "", data: "2026-10-10", quando: "hoje" })).toEqual({ q: "x", quando: "2026-10-10" });
  });

  it("volta para a URL e descreve os chips", () => {
    const f = filtersSchema.parse({ categoria: "bares", quando: "2026-10-10", preco: "ate-50" });
    expect(hasFilters(f)).toBe(true);
    expect(hasFilters({ quando: null })).toBe(false);
    expect(filtersToParams(f)).toEqual({ categoria: "bares", quando: "2026-10-10", preco: "ate-50" });
    expect(describeFilters(f)).toEqual([
      { param: "categoria", label: "Bares" },
      { param: "quando", label: "Em 10/10/2026" },
      { param: "preco", label: "Até R$ 50" },
    ]);
  });
});

describe("GetFilterOptions", () => {
  it("monta as opções com os bairros que têm lugares", async () => {
    const res = await new GetFilterOptions({ neighborhoods: vi.fn().mockResolvedValue([{ name: "América", places: 22 }]) }).execute();
    expect(res.ok && res.value.bairros).toEqual([{ value: "América", label: "América" }]);
    expect(res.ok && res.value.categorias[0]).toEqual({ value: "restaurantes", label: "Restaurantes" });
    expect(res.ok && res.value.datas.map((d) => d.value)).toEqual(["hoje", "amanha", "fim-de-semana"]);
    expect(res.ok && res.value.horarios.map((d) => d.value)).toEqual(["agora", "manha", "tarde", "noite"]);
    expect(res.ok && res.value.precos.map((d) => d.value)).toEqual(["gratis", "ate-50", "ate-100", "acima-100"]);
  });
});
