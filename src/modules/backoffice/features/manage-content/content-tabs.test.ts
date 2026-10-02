import { describe, expect, it } from "vitest";
import { contentHref, contentQuery } from "./content-tabs";

describe("contentQuery", () => {
  it("sem parâmetros abre em lugares, sem texto", () => {
    expect(contentQuery({})).toEqual({ tab: "lugares", text: "" });
  });

  it("lê a aba e apara o texto", () => {
    expect(contentQuery({ tipo: "eventos", q: "  show  " })).toEqual({ tab: "eventos", text: "show" });
  });

  it("aba desconhecida e texto longo demais caem no padrão", () => {
    expect(contentQuery({ tipo: "usuarios", q: "x".repeat(200) })).toEqual({ tab: "lugares", text: "" });
  });

  it("parâmetro repetido usa o primeiro valor", () => {
    expect(contentQuery({ tipo: ["missoes", "eventos"], q: ["rota", "outra"] })).toEqual({ tab: "missoes", text: "rota" });
  });
});

describe("contentHref", () => {
  it("monta a URL da aba e mantém o texto buscado", () => {
    expect(contentHref("eventos")).toBe("/admin/conteudo?tipo=eventos");
    expect(contentHref("missoes", "rota do chope")).toBe("/admin/conteudo?tipo=missoes&q=rota+do+chope");
  });
});
