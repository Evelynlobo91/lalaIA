import { describe, expect, it, vi } from "vitest";
import type { CtaRecord } from "../../domain/cta";
import { GetActiveCta, pickActiveCta } from "./active-cta.use-case";

const at = (time: string) => new Date(`2026-10-02T${time}:00-03:00`);
const liveSince = at("20:00");

const cta = (patch: Partial<CtaRecord> = {}): CtaRecord => ({
  id: "c1",
  streamId: "s1",
  ownerId: "dona",
  type: "link",
  refId: null,
  href: "https://instagram.com/bar",
  external: true,
  title: "Siga o bar",
  body: null,
  buttonLabel: "Abrir",
  priority: 2,
  schedule: { kind: "absolute", startsAt: at("20:00"), endsAt: at("21:00") },
  createdAt: at("10:00"),
  ...patch,
});

describe("pickActiveCta", () => {
  it("devolve o CTA da janela, com o destino e até quando fica na tela", () => {
    expect(pickActiveCta([cta()], at("20:30"), liveSince)).toEqual({
      id: "c1",
      type: "link",
      title: "Siga o bar",
      body: null,
      buttonLabel: "Abrir",
      href: "https://instagram.com/bar",
      external: true,
      until: at("21:00").toISOString(),
    });
  });

  it("fora da janela de todos → nada", () => {
    expect(pickActiveCta([cta()], at("19:59"), liveSince)).toBeNull();
    expect(pickActiveCta([cta()], at("21:00"), liveSince)).toBeNull();
    expect(pickActiveCta([], at("20:30"), liveSince)).toBeNull();
  });

  it("um por vez: vence a maior prioridade; no empate, o mais antigo", () => {
    const normal = cta({ id: "normal" });
    const alta = cta({ id: "alta", priority: 1, createdAt: at("12:00"), schedule: { kind: "relative", offsetMinutes: 20, durationMinutes: 20 } });
    const maisNovo = cta({ id: "novo", createdAt: at("11:00") });
    expect(pickActiveCta([normal, alta, maisNovo], at("20:10"), liveSince)?.id).toBe("normal");
    expect(pickActiveCta([maisNovo, normal, alta], at("20:25"), liveSince)).toMatchObject({ id: "alta", until: at("20:40").toISOString() });
    expect(pickActiveCta([maisNovo, normal, alta], at("20:45"), liveSince)?.id).toBe("normal");
  });

  it("recorrente: aparece e some a cada intervalo", () => {
    const recorrente = cta({ schedule: { kind: "recurring", intervalMinutes: 30, durationMinutes: 5 } });
    expect(pickActiveCta([recorrente], at("20:10"), liveSince)).toBeNull();
    expect(pickActiveCta([recorrente], at("20:32"), liveSince)?.until).toBe(at("20:35").toISOString());
    expect(pickActiveCta([recorrente], at("20:36"), liveSince)).toBeNull();
  });
});

describe("GetActiveCta", () => {
  const deps = (list: CtaRecord[] | Error = [cta()]) => {
    const listForStream = vi.fn(() => (list instanceof Error ? Promise.reject(list) : Promise.resolve(list)));
    const log = { warn: vi.fn() };
    return { listForStream, log, useCase: new GetActiveCta({ listForStream }, log, () => at("20:30")) };
  };

  it("live no ar: devolve o CTA da vez", async () => {
    const { useCase, listForStream } = deps();
    expect(await useCase.execute({ streamId: "s1", status: "live", liveSince })).toMatchObject({ id: "c1" });
    expect(listForStream).toHaveBeenCalledWith("s1");
  });

  it.each(["waiting", "paused", "ended"] as const)("live %s: nenhum CTA, sem consultar o banco", async (status) => {
    const { useCase, listForStream } = deps();
    expect(await useCase.execute({ streamId: "s1", status, liveSince: null })).toBeNull();
    expect(listForStream).not.toHaveBeenCalled();
  });

  it("sem transmissão → nada; leitura com falha → a live segue sem CTA e o problema é registrado", async () => {
    expect(await deps().useCase.execute(null)).toBeNull();
    const { useCase, log } = deps(new Error("banco fora"));
    expect(await useCase.execute({ streamId: "s1", status: "live", liveSince })).toBeNull();
    expect(log.warn).toHaveBeenCalledWith("chamadas da live indisponíveis", expect.objectContaining({ streamId: "s1" }));
  });
});
