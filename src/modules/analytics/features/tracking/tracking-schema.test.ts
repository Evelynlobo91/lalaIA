import { describe, expect, it } from "vitest";
import { trackUiSchema } from "./tracking.schema";

const ID = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";

describe("trackUiSchema: o que a tela pode enviar", () => {
  it("visualizações de lugar, evento e live", () => {
    expect(trackUiSchema.safeParse({ kind: "view", entityType: "place", entityId: ID }).success).toBe(true);
    expect(trackUiSchema.safeParse({ kind: "live_view", entityType: "live", entityId: ID }).success).toBe(true);
  });

  it("chamada da live (#182): impressão e toque, só para a entidade chamada", () => {
    expect(trackUiSchema.safeParse({ kind: "cta_impression", entityType: "cta", entityId: ID }).success).toBe(true);
    expect(trackUiSchema.safeParse({ kind: "cta_click", entityType: "cta", entityId: ID }).success).toBe(true);
    expect(trackUiSchema.safeParse({ kind: "cta_click", entityType: "place", entityId: ID }).success).toBe(false);
    expect(trackUiSchema.safeParse({ kind: "view", entityType: "cta", entityId: ID }).success).toBe(false);
  });

  it("favoritar, 'Quero ir' e check-in não entram pela tela (vêm dos eventos de domínio)", () => {
    for (const kind of ["favorite", "quero_ir", "checkin"]) {
      expect(trackUiSchema.safeParse({ kind, entityType: "place", entityId: ID }).success).toBe(false);
      expect(trackUiSchema.safeParse({ kind, entityType: "cta", entityId: ID }).success).toBe(false);
    }
    expect(trackUiSchema.safeParse({ kind: "view", entityType: "place", entityId: "x" }).success).toBe(false);
  });
});
