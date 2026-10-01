import { describe, expect, it, vi } from "vitest";
import { GetPlacesGeo } from "./places-geo";

describe("GetPlacesGeo", () => {
  it("gera GeoJSON com [longitude, latitude] (ordem do padrão) e só as propriedades do mapa", async () => {
    const reader = { allPoints: vi.fn().mockResolvedValue([{ id: "p1", name: "Museu", category: "cultura", lat: -26.30451234567, lon: -48.84561234567 }]) };

    const res = await new GetPlacesGeo(reader).execute();

    expect(res.ok && res.value).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "p1",
          geometry: { type: "Point", coordinates: [-48.845612, -26.304512] },
          properties: { id: "p1", name: "Museu", category: "cultura", categoryLabel: "Museus e cultura" },
        },
      ],
    });
  });

  it("sem lugares → coleção vazia", async () => {
    const res = await new GetPlacesGeo({ allPoints: vi.fn().mockResolvedValue([]) }).execute();
    expect(res.ok && res.value.features).toEqual([]);
  });
});
