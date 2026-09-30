import { describe, expect, it, vi } from "vitest";
import { defaultPreferences } from "../../domain/preferences";
import { EditProfile, editProfileSchema } from "../edit-profile/edit-profile";
import { DefaultingPreferencesReader } from "../preferences-reader/preferences-reader";
import { EditPreferences, editPreferencesSchema } from "./edit-preferences";

const base = { categories: ["cultura", "bares"], budgetMax: "100", radiusKm: "10", groupSize: "amigos" };

describe("editPreferencesSchema", () => {
  it("converte os campos do formulário em preferências", () => {
    expect(editPreferencesSchema.parse(base)).toEqual({ categories: ["cultura", "bares"], budgetMax: 100, radiusKm: 10, groupSize: "amigos" });
  });

  it('"" significa não definido para orçamento e companhia', () => {
    expect(editPreferencesSchema.parse({ ...base, budgetMax: "", groupSize: "" })).toMatchObject({ budgetMax: null, groupSize: null });
  });

  it("sem categorias marcadas → lista vazia", () => {
    expect(editPreferencesSchema.parse({ ...base, categories: undefined }).categories).toEqual([]);
  });

  it.each([
    ["categoria fora do catálogo", { categories: ["hackear"] }],
    ["orçamento fora das opções", { budgetMax: "99999" }],
    ["distância fora das opções", { radiusKm: "7" }],
    ["companhia inválida", { groupSize: "multidao" }],
  ])("recusa %s", (_, patch) => {
    expect(editPreferencesSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});

describe("EditPreferences", () => {
  it("salva para o usuário informado (da sessão), sem categorias repetidas", async () => {
    const repo = { save: vi.fn().mockResolvedValue(undefined) };
    const input = editPreferencesSchema.parse({ ...base, categories: ["cultura", "cultura", "bares"] });

    const res = await new EditPreferences(repo).execute("u1", input);

    expect(repo.save).toHaveBeenCalledWith("u1", { categories: ["cultura", "bares"], budgetMax: 100, radiusKm: 10, groupSize: "amigos" });
    expect(res.ok).toBe(true);
  });
});

describe("EditProfile", () => {
  it("atualiza o nome já normalizado", async () => {
    const repo = { updateDisplayName: vi.fn().mockResolvedValue(undefined) };
    const input = editProfileSchema.parse({ displayName: "  Lala  " });
    expect(await new EditProfile(repo).execute("u1", input)).toEqual({ ok: true, value: { displayName: "Lala" } });
    expect(repo.updateDisplayName).toHaveBeenCalledWith("u1", "Lala");
  });

  it("recusa nome vazio ou longo demais", () => {
    expect(editProfileSchema.safeParse({ displayName: "   " }).success).toBe(false);
    expect(editProfileSchema.safeParse({ displayName: "x".repeat(81) }).success).toBe(false);
  });
});

describe("DefaultingPreferencesReader (API pública)", () => {
  it("quem nunca configurou recebe os padrões", async () => {
    const reader = new DefaultingPreferencesReader({ find: vi.fn().mockResolvedValue(null) });
    expect(await reader.preferencesOf("u1")).toEqual(defaultPreferences);
  });

  it("devolve o que foi salvo", async () => {
    const saved = { categories: ["cultura" as const], budgetMax: 50, radiusKm: 5, groupSize: "casal" as const };
    const reader = new DefaultingPreferencesReader({ find: vi.fn().mockResolvedValue(saved) });
    expect(await reader.preferencesOf("u1")).toEqual(saved);
  });
});
