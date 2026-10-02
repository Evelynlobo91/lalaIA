import { describe, expect, it, vi } from "vitest";
import type { OsmElement } from "../../domain/osm/osm-element";
import { OverpassOsmSource } from "../../infra/osm-sources";
import { ImportOsmPlaces } from "./import-osm.use-case";

const el = (id: number, tags: Record<string, string>): OsmElement => ({ type: "node", id, lat: -26.3, lon: -48.84, tags });

describe("ImportOsmPlaces", () => {
  it("converte, descarta inválidos e duplicados, e grava o restante com relatório", async () => {
    const elements = [
      el(1, { name: "Bar A", amenity: "bar" }),
      el(1, { name: "Bar A (repetido)", amenity: "bar" }),
      el(2, { name: "Museu", tourism: "museum" }),
      el(3, { amenity: "restaurant" }),
      el(4, { name: "Estacionamento", amenity: "parking" }),
    ];
    const repository = { upsertMany: vi.fn().mockResolvedValue({ inserted: 2, updated: 0, unchanged: 0 }) };

    const report = await new ImportOsmPlaces({ fetchElements: async () => elements }, repository).execute();

    expect(repository.upsertMany).toHaveBeenCalledWith([expect.objectContaining({ sourceId: "node/1", name: "Bar A" }), expect.objectContaining({ sourceId: "node/2" })]);
    expect(report).toEqual({
      fetched: 5,
      inserted: 2,
      updated: 0,
      unchanged: 0,
      skipped: { duplicado: 1, sem_nome: 1, sem_categoria: 1 },
      byCategory: { bares: 1, cultura: 1 },
    });
  });
});

describe("OverpassOsmSource", () => {
  const ok = (elements: unknown[]) => new Response(JSON.stringify({ elements }), { status: 200 });
  const busy = () => new Response("ocupado", { status: 504 });

  it("envia User-Agent identificando o app (política do Overpass)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok([]));
    await new OverpassOsmSource(["https://a.example/api"], { fetchFn }).fetchElements();
    expect(fetchFn.mock.calls[0][1].headers["User-Agent"]).toMatch(/^LalaIA\//);
  });

  it("servidor ocupado: tenta de novo e depois passa para o espelho", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy()).mockResolvedValueOnce(ok([{ id: 1 }]));
    const elements = await new OverpassOsmSource(["https://a.example/api", "https://b.example/api"], { fetchFn, backoffMs: 0 }).fetchElements();

    expect(elements).toEqual([{ id: 1 }]);
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual(["https://a.example/api", "https://a.example/api", "https://b.example/api"]);
  });

  it("todos fora do ar: erro explica as tentativas e sugere o snapshot", async () => {
    const fetchFn = vi.fn().mockResolvedValue(busy());
    await expect(new OverpassOsmSource(["https://a.example/api"], { fetchFn, backoffMs: 0 }).fetchElements()).rejects.toThrow(/a\.example → 504.*places:seed/);
  });

  it("erro não recuperável (400) não insiste no mesmo servidor", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("consulta ruim", { status: 400 }));
    await expect(new OverpassOsmSource(["https://a.example/api"], { fetchFn, backoffMs: 0 }).fetchElements()).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
