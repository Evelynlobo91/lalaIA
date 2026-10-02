import { describe, expect, it } from "vitest";
import { BACKOFFICE_HOME, backofficeSections, isSectionActive } from "./backoffice-sections";

describe("seções do backoffice", () => {
  it("ficam todas sob /admin, sem rota repetida", () => {
    const hrefs = backofficeSections.map((s) => s.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href === BACKOFFICE_HOME || href.startsWith(`${BACKOFFICE_HOME}/`)).toBe(true);
  });

  it("o início só fica ativo na própria rota", () => {
    expect(isSectionActive("/admin", "/admin")).toBe(true);
    expect(isSectionActive("/admin/parceiros", "/admin")).toBe(false);
  });

  it("as demais seções ficam ativas também nas subpáginas", () => {
    expect(isSectionActive("/admin/parceiros", "/admin/parceiros")).toBe(true);
    expect(isSectionActive("/admin/parceiros/123", "/admin/parceiros")).toBe(true);
    expect(isSectionActive("/admin/parceiros-antigos", "/admin/parceiros")).toBe(false);
  });

  it("em qualquer rota do backoffice, no máximo uma seção fica ativa", () => {
    for (const pathname of ["/admin", "/admin/usuarios", "/admin/leads/42", "/admin/desconhecida"]) {
      expect(backofficeSections.filter((s) => isSectionActive(pathname, s.href)).length).toBeLessThanOrEqual(1);
    }
  });
});
