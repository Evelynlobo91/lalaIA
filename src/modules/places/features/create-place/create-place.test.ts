import { describe, expect, it, vi } from "vitest";
import { CreatePlaceByAdmin, createPlaceSchema } from "./create-place";

const form = (patch: Record<string, string> = {}) => ({
  name: "  Bar do Centro  ",
  category: "bares",
  street: "Rua do Príncipe",
  houseNumber: "100",
  neighborhood: "Centro",
  phone: "",
  website: "bardocentro.com.br",
  lat: "-26,3045",
  lon: "-48.8456",
  ...patch,
});

describe("createPlaceSchema", () => {
  it("normaliza os campos: apara o nome, vazio vira null, site ganha https e vírgula decimal é aceita", () => {
    expect(createPlaceSchema.parse(form())).toEqual({
      name: "Bar do Centro",
      category: "bares",
      address: { street: "Rua do Príncipe", houseNumber: "100", neighborhood: "Centro" },
      phone: null,
      website: "https://bardocentro.com.br/",
      location: { lat: -26.3045, lon: -48.8456 },
    });
  });

  it("recusa coordenada fora de Joinville (São Paulo e Joinville, França)", () => {
    expect(createPlaceSchema.safeParse(form({ lat: "-23.55", lon: "-46.63" })).success).toBe(false);
    expect(createPlaceSchema.safeParse(form({ lat: "48.44", lon: "5.14" })).success).toBe(false);
  });

  it("recusa coordenada vazia ou que não é número", () => {
    expect(createPlaceSchema.safeParse(form({ lat: "" })).success).toBe(false);
    expect(createPlaceSchema.safeParse(form({ lon: "abc" })).success).toBe(false);
  });

  it("recusa categoria fora do catálogo, nome curto e site que não é http(s)", () => {
    expect(createPlaceSchema.safeParse(form({ category: "inventada" })).success).toBe(false);
    expect(createPlaceSchema.safeParse(form({ name: "A" })).success).toBe(false);
    expect(createPlaceSchema.safeParse(form({ website: "javascript:alert(1)" })).success).toBe(false);
  });
});

describe("CreatePlaceByAdmin", () => {
  const place = createPlaceSchema.parse(form());

  it("admin cadastra; a gravação vai como o próprio admin (RLS)", async () => {
    const createByAdmin = vi.fn().mockResolvedValue("novo-id");
    const result = await new CreatePlaceByAdmin({ createByAdmin }).execute({ id: "admin", isAdmin: true }, place);
    expect(result).toEqual({ ok: true, value: { placeId: "novo-id" } });
    expect(createByAdmin).toHaveBeenCalledWith("admin", place);
  });

  it("quem não é admin não cadastra e não chega a gravar", async () => {
    const createByAdmin = vi.fn();
    const result = await new CreatePlaceByAdmin({ createByAdmin }).execute({ id: "u1", isAdmin: false }, place);
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(createByAdmin).not.toHaveBeenCalled();
  });
});
