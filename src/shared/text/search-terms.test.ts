import { describe, expect, it } from "vitest";
import { categoriesMatching } from "../catalog/category-search";
import { foldAccents, searchTerms } from "./search-terms";

describe("termos de busca", () => {
  it("tira acentos e caixa", () => {
    expect(foldAccents("Açaí da PRAÇA")).toBe("acai da praca");
  });

  it("só letras e números: operadores do tsquery não passam", () => {
    expect(searchTerms("bar & (zé) | !café:* 'x'")).toEqual(["bar", "zé", "café", "x"]);
    expect(searchTerms(" !!! ")).toEqual([]);
  });

  it("limita a quantidade e o tamanho dos termos", () => {
    expect(searchTerms("a b c d e f g h i j")).toHaveLength(8);
    expect(searchTerms("x".repeat(100))[0]).toHaveLength(40);
  });
});

describe("categoriesMatching", () => {
  it("acha a categoria pelo nome, sem acento e por prefixo", () => {
    expect(categoriesMatching("bares")).toEqual(["bares"]);
    expect(categoriesMatching("cafe")).toEqual(["cafes"]);
    expect(categoriesMatching("Museu")).toEqual(["cultura"]);
    expect(categoriesMatching("parque")).toEqual(["ar-livre"]);
  });

  it("todos os termos precisam casar: 'bar do zé' não vira 'todos os bares'", () => {
    expect(categoriesMatching("bar do zé")).toEqual([]);
    expect(categoriesMatching("")).toEqual([]);
  });
});
