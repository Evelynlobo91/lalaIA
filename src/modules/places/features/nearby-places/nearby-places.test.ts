import { describe, expect, it, vi } from "vitest";
import { nearbyPlacesSchema, roundCoordinate } from "./nearby-places.schema";
import { FindNearbyPlaces, formatDistance } from "./nearby-places.use-case";

const CENTRO = { lat: "-26.3045", lon: "-48.8456" };

describe("nearbyPlacesSchema", () => {
  it("aceita ponto em Joinville com raio padrão de 2 km", () => {
    expect(nearbyPlacesSchema.parse(CENTRO)).toEqual({ lat: -26.3045, lon: -48.8456, radius: 2000, limit: 30 });
  });

  it("arredonda a coordenada para ~10 m (privacidade)", () => {
    expect(nearbyPlacesSchema.parse({ lat: "-26.304512345", lon: "-48.845698765" })).toMatchObject({ lat: -26.3045, lon: -48.8457 });
    expect(roundCoordinate(-26.30456)).toBe(-26.3046);
  });

  it.each([
    ["São Paulo", { lat: "-23.55", lon: "-46.63" }],
    ["Joinville, França", { lat: "48.44", lon: "5.14" }],
    ["sem número", { lat: "abc", lon: "-48.84" }],
    ["vazio", {}],
  ])("recusa %s", (_, params) => {
    expect(nearbyPlacesSchema.safeParse(params).success).toBe(false);
  });

  it("fora da área: mensagem explica o motivo", () => {
    const res = nearbyPlacesSchema.safeParse({ lat: "-23.55", lon: "-46.63" });
    expect(res.error?.issues[0].message).toBe("Fora da área atendida (Joinville e arredores).");
  });

  it("só aceita os raios oferecidos (1, 2, 5, 10 km)", () => {
    expect(nearbyPlacesSchema.parse({ ...CENTRO, radius: "5000" }).radius).toBe(5000);
    expect(nearbyPlacesSchema.safeParse({ ...CENTRO, radius: "999999" }).success).toBe(false);
  });
});

describe("formatDistance", () => {
  it.each([
    [3, "10 m"],
    [84, "80 m"],
    [956, "960 m"],
    [999.4, "1000 m"],
    [1234, "1,2 km"],
    [9_960, "10,0 km"],
    [12_345, "12 km"],
  ])("%d m → %s", (meters, label) => {
    expect(formatDistance(meters)).toBe(label);
  });
});

describe("FindNearbyPlaces", () => {
  it("consulta pela origem/raio e devolve distância formatada, categoria e 'aberto agora'", async () => {
    const reader = {
      nearby: vi.fn().mockResolvedValue([
        { id: "a", name: "Bar perto", category: "bares", neighborhood: "Centro", openingHours: "24/7", distanceMeters: 152.7 },
        { id: "b", name: "Museu", category: "cultura", neighborhood: null, openingHours: null, distanceMeters: 1840 },
      ]),
    };
    const input = nearbyPlacesSchema.parse({ ...CENTRO, radius: "5000" });

    const res = await new FindNearbyPlaces(reader).execute(input);

    expect(reader.nearby).toHaveBeenCalledWith({ lat: -26.3045, lon: -48.8456 }, 5000, 30);
    expect(res.ok && res.value).toMatchObject({
      origin: { lat: -26.3045, lon: -48.8456 },
      radiusMeters: 5000,
      items: [
        { id: "a", categoryLabel: "Bares", distanceMeters: 153, distanceLabel: "150 m", openNow: true },
        { id: "b", categoryLabel: "Museus e cultura", distanceMeters: 1840, distanceLabel: "1,8 km", openNow: null },
      ],
    });
  });
});
