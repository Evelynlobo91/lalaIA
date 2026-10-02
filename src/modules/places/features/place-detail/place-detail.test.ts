import { describe, expect, it, vi } from "vitest";
import { describeOpeningHours } from "../../domain/opening-hours";
import { directionsUrl, formatAddress, splitPhones, telHref, type PlaceDetails } from "../../domain/place-details";
import { GetPlaceDetail } from "./place-detail.use-case";

const ID = "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f";
const place = (patch: Partial<PlaceDetails> = {}): PlaceDetails => ({
  id: ID,
  name: "Grão da Terra",
  category: "restaurantes",
  address: { street: "Rua Coelho Neto", houseNumber: "268", neighborhood: "Santo Antônio", postcode: "89218-015", city: "Joinville" },
  phone: "+55 47 3433-0000",
  website: "https://graodaterra.com.br/",
  openingHours: "Mo-Fr 11:00-14:30",
  location: { lat: -26.275995, lon: -48.8503183 },
  source: "osm",
  ...patch,
});

describe("formatação", () => {
  it("endereço completo e parcial", () => {
    expect(formatAddress(place().address)).toBe("Rua Coelho Neto, 268 - Santo Antônio, Joinville - SC");
    expect(formatAddress({ street: null, houseNumber: null, neighborhood: "Centro", postcode: null, city: "Joinville" })).toBe("Centro, Joinville - SC");
    expect(formatAddress({ street: null, houseNumber: null, neighborhood: null, postcode: null, city: "Joinville" })).toBeNull();
  });

  it("link de telefone só com dígitos", () => {
    expect(telHref("+55 (47) 3433-0000")).toBe("tel:+554734330000");
    expect(telHref("ramal 12")).toBeNull();
  });

  it("separa campos com vários telefones (dado real do OSM)", () => {
    expect(splitPhones("+55 47 4009 8593; +55 47 4009 8510")).toEqual(["+55 47 4009 8593", "+55 47 4009 8510"]);
    expect(splitPhones("(47) 3433-0000 / (47) 99999-0000")).toEqual(["(47) 3433-0000", "(47) 99999-0000"]);
    expect(splitPhones("(47) 3433-0000 ou (47) 3433-0001")).toEqual(["(47) 3433-0000", "(47) 3433-0001"]);
  });

  it("rota pelo app de mapas, sem chave de API", () => {
    expect(directionsUrl({ lat: -26.275995, lon: -48.8503183 })).toBe("https://www.google.com/maps/dir/?api=1&destination=-26.275995,-48.850318");
  });

  it("horário legível de segunda a domingo", () => {
    expect(describeOpeningHours("Mo-Fr 11:00-14:30,18:00-23:00; Sa 11:00-15:00")).toEqual([
      { day: "Seg", hours: "11:00–14:30, 18:00–23:00" },
      { day: "Ter", hours: "11:00–14:30, 18:00–23:00" },
      { day: "Qua", hours: "11:00–14:30, 18:00–23:00" },
      { day: "Qui", hours: "11:00–14:30, 18:00–23:00" },
      { day: "Sex", hours: "11:00–14:30, 18:00–23:00" },
      { day: "Sáb", hours: "11:00–15:00" },
      { day: "Dom", hours: "Fechado" },
    ]);
    expect(describeOpeningHours("24/7")?.[0]).toEqual({ day: "Seg", hours: "24 horas" });
    expect(describeOpeningHours("de 18:00 a 00:00")?.[0]).toEqual({ day: "Seg", hours: "18:00–00:00" });
  });
});

describe("GetPlaceDetail", () => {
  const noonMonday = () => new Date("2026-10-05T15:00:00Z");

  it("id inválido não chega ao banco e responde como não encontrado", async () => {
    const reader = { findById: vi.fn() };
    const res = await new GetPlaceDetail(reader).execute("../../etc/passwd");
    expect(!res.ok && res.error.code).toBe("not_found");
    expect(reader.findById).not.toHaveBeenCalled();
  });

  it("lugar inexistente → não encontrado", async () => {
    const res = await new GetPlaceDetail({ findById: vi.fn().mockResolvedValue(null) }).execute(ID);
    expect(res.ok).toBe(false);
  });

  it("monta a visão com tudo o que existe", async () => {
    const res = await new GetPlaceDetail({ findById: vi.fn().mockResolvedValue(place()) }, noonMonday).execute(ID);
    expect(res.ok && res.value).toMatchObject({
      name: "Grão da Terra",
      categoryLabel: "Restaurantes",
      address: "Rua Coelho Neto, 268 - Santo Antônio, Joinville - SC",
      phones: [{ label: "+55 47 3433-0000", href: "tel:+554734330000" }],
      openNow: true,
      rawHours: null,
      fromOpenStreetMap: true,
    });
  });

  it("horário que não reconhecemos aparece como veio da fonte (sem 'aberto agora')", async () => {
    const res = await new GetPlaceDetail({ findById: vi.fn().mockResolvedValue(place({ openingHours: "Mo-Fr 14:00+" })) }).execute(ID);
    expect(res.ok && [res.value.weeklyHours, res.value.rawHours, res.value.openNow]).toEqual([null, "Mo-Fr 14:00+", null]);
  });

  it("campos ausentes ficam nulos (a tela não mostra)", async () => {
    const res = await new GetPlaceDetail({ findById: vi.fn().mockResolvedValue(place({ phone: null, website: null, openingHours: null })) }).execute(ID);
    expect(res.ok && [res.value.phones, res.value.website, res.value.weeklyHours, res.value.rawHours]).toEqual([[], null, null, null]);
  });
});
