import { describe, expect, it, vi } from "vitest";
import type { EditablePlace, PlaceOwnershipRepository } from "../../domain/place-ownership";
import { osmFromSchedule, scheduleFromOsm, type WeeklySchedule } from "../../domain/weekly-schedule";
import { EditOwnedPlace, editPlaceSchema, placeForEdit } from "./edit-place";

const ID = "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f";
const closed = { open: false, from: "09:00", to: "18:00" };
const day = (from: string, to: string) => ({ open: true, from, to });

describe("horário semanal ⇄ formato OSM", () => {
  it("agrupa dias seguidos iguais", () => {
    const week: WeeklySchedule = [day("11:00", "14:00"), day("11:00", "14:00"), day("11:00", "14:00"), day("11:00", "14:00"), day("11:00", "14:00"), day("10:00", "16:00"), closed];
    expect(osmFromSchedule(week)).toBe("Mo-Fr 11:00-14:00; Sa 10:00-16:00");
  });

  it("dias não seguidos ficam separados; semana fechada → null", () => {
    const week: WeeklySchedule = [day("18:00", "02:00"), closed, day("18:00", "02:00"), closed, closed, closed, closed];
    expect(osmFromSchedule(week)).toBe("Mo 18:00-02:00; We 18:00-02:00");
    expect(osmFromSchedule(Array(7).fill(closed))).toBeNull();
  });

  it("ida e volta: OSM → editor → OSM", () => {
    const original = "Mo-Fr 08:00-17:30; Sa 09:00-12:00";
    expect(osmFromSchedule(scheduleFromOsm(original).schedule)).toBe(original);
  });

  it("dia com intervalos: fica o primeiro e avisa", () => {
    const { schedule, simplified } = scheduleFromOsm("Mo 11:00-14:00,18:00-23:00");
    expect(schedule[0]).toEqual(day("11:00", "14:00"));
    expect(simplified).toBe(true);
  });
});

describe("editPlaceSchema", () => {
  const form = (patch: Record<string, string | undefined> = {}) => {
    const base: Record<string, string | undefined> = { placeId: ID, name: " Café Novo ", category: "cafes", street: "", houseNumber: "", neighborhood: "Centro", phone: "", website: "cafenovo.com.br" };
    for (let i = 0; i < 7; i++) Object.assign(base, { [`day${i}_from`]: "08:00", [`day${i}_to`]: "18:00", [`day${i}_open`]: i < 5 ? "on" : undefined });
    return { ...base, ...patch };
  };

  it("monta a edição com horário OSM e site seguro; vazio vira null", () => {
    expect(editPlaceSchema.parse(form())).toEqual({
      placeId: ID,
      edit: {
        name: "Café Novo",
        category: "cafes",
        address: { street: null, houseNumber: null, neighborhood: "Centro" },
        phone: null,
        website: "https://cafenovo.com.br/",
        openingHours: "Mo-Fr 08:00-18:00",
      },
    });
  });

  it.each([
    ["site javascript:", { website: "javascript:alert(1)" }],
    ["categoria fora do catálogo", { category: "cassino" }],
    ["hora inválida", { day0_from: "25:00" }],
  ])("recusa %s", (_, patch) => {
    expect(editPlaceSchema.safeParse(form(patch)).success).toBe(false);
  });
});

describe("EditOwnedPlace / placeForEdit", () => {
  const place: EditablePlace = { id: ID, managedBy: "dono", name: "Café", category: "cafes", address: { street: null, houseNumber: null, neighborhood: null }, phone: null, website: null, openingHours: null };
  const repo = (patch: Partial<PlaceOwnershipRepository> = {}) =>
    ({ findEditable: vi.fn().mockResolvedValue(place), update: vi.fn().mockResolvedValue(true), ...patch }) as unknown as PlaceOwnershipRepository;
  const input = { placeId: ID, edit: { name: "Café", category: "cafes" as const, address: { street: null, houseNumber: null, neighborhood: null }, phone: null, website: null, openingHours: null } };

  it("dono edita; a gravação vai como o próprio usuário (RLS)", async () => {
    const r = repo();
    expect((await new EditOwnedPlace(r).execute({ id: "dono", isAdmin: false }, input)).ok).toBe(true);
    expect(r.update).toHaveBeenCalledWith("dono", ID, input.edit);
  });

  it("quem não é dono não edita e não chega a gravar", async () => {
    const r = repo();
    const res = await new EditOwnedPlace(r).execute({ id: "outro", isAdmin: false }, input);
    expect(!res.ok && res.error.code).toBe("forbidden");
    expect(r.update).not.toHaveBeenCalled();
  });

  it("se o banco (RLS) não alterar nada, responde proibido", async () => {
    const res = await new EditOwnedPlace(repo({ update: vi.fn().mockResolvedValue(false) })).execute({ id: "dono", isAdmin: false }, input);
    expect(!res.ok && res.error.code).toBe("forbidden");
  });

  it("formulário só é entregue ao dono ou admin; id inválido nem consulta", async () => {
    const r = repo();
    expect(await placeForEdit(r, { id: "outro", isAdmin: false }, ID)).toBeNull();
    expect(await placeForEdit(r, { id: "outro", isAdmin: true }, ID)).toEqual(place);
    expect(await placeForEdit(r, { id: "dono", isAdmin: false }, "../x")).toBeNull();
  });
});
