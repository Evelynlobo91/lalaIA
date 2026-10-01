import { describe, expect, it } from "vitest";
import { categoryFromOsmTags } from "./osm-category-rules";
import { placeFromOsm, safeWebsite, type OsmElement } from "./osm-element";

const node = (tags: Record<string, string>, extra: Partial<OsmElement> = {}): OsmElement => ({ type: "node", id: 1, lat: -26.3, lon: -48.84, tags, ...extra });

describe("categoryFromOsmTags", () => {
  it.each([
    [{ amenity: "restaurant" }, "restaurantes"],
    [{ amenity: "pub" }, "bares"],
    [{ shop: "bakery" }, "cafes"],
    [{ amenity: "nightclub" }, "festas"],
    [{ tourism: "museum" }, "cultura"],
    [{ tourism: "gallery" }, "exposicoes"],
    [{ leisure: "park" }, "ar-livre"],
    [{ leisure: "sports_centre" }, "esportes"],
    [{ historic: "archaeological_site" }, "passeios"],
    [{ amenity: "events_venue" }, "shows"],
  ])("%j → %s", (tags, category) => {
    expect(categoryFromOsmTags(tags)).toBe(category);
  });

  it("regra mais específica vence (museu histórico é cultura, não passeio)", () => {
    expect(categoryFromOsmTags({ tourism: "museum", historic: "building" })).toBe("cultura");
  });

  it("tag desconhecida → sem categoria", () => {
    expect(categoryFromOsmTags({ amenity: "parking" })).toBeNull();
  });
});

describe("placeFromOsm", () => {
  it("monta o lugar com nome, categoria, endereço, contato e coordenada", () => {
    const res = placeFromOsm(
      node({
        name: "  Grão da  Terra ",
        amenity: "restaurant",
        "addr:street": "Rua Coelho Neto",
        "addr:housenumber": "268",
        "addr:suburb": "Santo Antônio",
        "addr:postcode": "89218-015",
        phone: "+55 47 3433-0000",
        website: "www.graodaterra.com.br",
        opening_hours: "Mo-Fr 11:00-14:30",
      }),
    );
    expect(res).toEqual({
      ok: true,
      draft: {
        source: "osm",
        sourceId: "node/1",
        name: "Grão da Terra",
        category: "restaurantes",
        address: { street: "Rua Coelho Neto", houseNumber: "268", neighborhood: "Santo Antônio", postcode: "89218-015", city: "Joinville" },
        phone: "+55 47 3433-0000",
        website: "https://www.graodaterra.com.br/",
        openingHours: "Mo-Fr 11:00-14:30",
        location: { lat: -26.3, lon: -48.84 },
      },
    });
  });

  it("vias e relações usam o centro", () => {
    const res = placeFromOsm({ type: "way", id: 9, center: { lat: -26.31, lon: -48.85 }, tags: { name: "Parque", leisure: "park" } });
    expect(res.ok && res.draft).toMatchObject({ sourceId: "way/9", location: { lat: -26.31, lon: -48.85 } });
  });

  it.each([
    ["sem_nome", node({ amenity: "restaurant" })],
    ["sem_nome", node({ amenity: "restaurant", name: "   " })],
    ["sem_categoria", node({ amenity: "parking", name: "Estacionamento" })],
    ["sem_coordenada", { type: "way", id: 2, tags: { name: "X", leisure: "park" } } as OsmElement],
    ["sem_coordenada", node({ name: "Joinville (França)", amenity: "cafe" }, { lat: 48.44, lon: 5.14 })],
  ])("descarta: %s", (reason, element) => {
    expect(placeFromOsm(element)).toEqual({ ok: false, reason });
  });
});

describe("safeWebsite", () => {
  it.each([
    ["https://joinville.sc.gov.br", "https://joinville.sc.gov.br/"],
    ["http://exemplo.com/a?b=1", "http://exemplo.com/a?b=1"],
    ["www.exemplo.com.br", "https://www.exemplo.com.br/"],
  ])("aceita %s", (input, expected) => {
    expect(safeWebsite(input)).toBe(expected);
  });

  it.each(["javascript:alert(1)", "data:text/html,<script>", "ftp://exemplo.com", "não é site", "", undefined])("recusa %s", (input) => {
    expect(safeWebsite(input)).toBeNull();
  });
});
