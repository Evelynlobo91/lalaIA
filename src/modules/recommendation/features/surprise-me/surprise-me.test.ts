import { describe, expect, it, vi } from "vitest";
import { validateItinerary, travelLabel, type ItineraryPlanner, type PlanInput, type PlannedStop } from "../../domain/itinerary";
import type { Recommendation } from "../../domain/score";
import { ANONYMOUS_PROFILE } from "../../domain/taste-profile";
import { NOW, at, candidate } from "../../domain/test-fixtures";
import { ClaudeItineraryPlanner } from "../../infra/claude-itinerary-planner";
import { LocalItineraryPlanner } from "../../infra/local-itinerary-planner";
import { noConstraintParams } from "../rec-constraints/rec-constraints.schema";
import { SurpriseMe } from "./surprise-me.use-case";

const rec = (overrides: Parameters<typeof candidate>[0]): Recommendation => ({
  candidate: candidate(overrides),
  score: 5,
  reasons: [{ signal: "preference", text: "Porque você curte Shows e música", points: 3 }],
});

const ranked = [
  rec({ id: "show", title: "Show", priceCents: 3000, distanceMeters: 400 }),
  rec({ kind: "place", id: "bar", title: "Bar", category: "bares", href: "/lugares/bar", priceCents: null, distanceMeters: 2400, availability: { known: true, window: { start: at(-60), end: at(240) } } }),
  rec({ id: "feira", title: "Feira", priceCents: 0, availability: { known: true, window: { start: at(30), end: at(200) } } }),
];

function setup(planner: ItineraryPlanner | null, recs = ranked) {
  const log = { warn: vi.fn() };
  const engine = { recommend: vi.fn().mockResolvedValue(recs) };
  const profiles = { profileOf: vi.fn().mockResolvedValue(ANONYMOUS_PROFILE) };
  const useCase = new SurpriseMe(profiles, engine, planner, new LocalItineraryPlanner(), log, () => NOW);
  return { useCase, log, engine };
}

const claudeSaying = (stops: PlannedStop[] | Error): ItineraryPlanner => ({
  name: "claude",
  plan: stops instanceof Error ? vi.fn().mockRejectedValue(stops) : vi.fn().mockResolvedValue(stops),
});

const params = { ...noConstraintParams, tempo: 180, pessoas: 2, orcamento: 100 };

describe("SurpriseMe", () => {
  it("usa o roteiro do Claude quando ele é válido, com ordem, deslocamento, justificativa e custo", async () => {
    const { useCase, engine } = setup(
      claudeSaying([
        { key: "event:show", travel: "5 min a pé", why: "Começou agora e é perto", estimatedCostCents: 999 },
        { key: "place:bar", travel: "10 min de app", why: "Para fechar a noite", estimatedCostCents: 4000 },
      ]),
    );
    const result = await useCase.execute({ userId: null, params });
    if (!result.ok) throw new Error("esperava ok");

    expect(engine.recommend.mock.calls[0]![2]).toBe(15);
    expect(result.value.source).toBe("claude");
    expect(result.value.stops.map((s) => [s.order, s.item.title, s.travel, s.why, s.costLabel])).toEqual([
      [1, "Show", "5 min a pé", "Começou agora e é perto", "R$ 60,00"], // preço conhecido × 2 pessoas, não o inventado
      [2, "Bar", "10 min de app", "Para fechar a noite", "R$ 40,00"],
    ]);
    expect(result.value.totalCostLabel).toBe("R$ 100,00");
  });

  it.each([
    ["inventa um lugar fora da lista", [{ key: "place:nao-existe", travel: "x", why: "y", estimatedCostCents: 0 }]],
    ["estoura o orçamento", [{ key: "event:show", travel: "x", why: "y", estimatedCostCents: null }, { key: "place:bar", travel: "x", why: "y", estimatedCostCents: 9000 }]],
    ["repete a mesma parada", [{ key: "event:show", travel: "x", why: "y", estimatedCostCents: null }, { key: "event:show", travel: "x", why: "y", estimatedCostCents: null }]],
  ])("quando o Claude %s, cai no motor local", async (_caso, stops) => {
    const { useCase, log } = setup(claudeSaying(stops as PlannedStop[]));
    const result = await useCase.execute({ userId: null, params });
    if (!result.ok) throw new Error("esperava ok");
    expect(result.value.source).toBe("motor");
    expect(result.value.stops.length).toBeGreaterThan(0);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("recusado"), expect.objectContaining({ planner: "claude" }));
  });

  it("quando o Claude falha (timeout, erro de rede), cai no motor local", async () => {
    const { useCase, log } = setup(claudeSaying(new Error("The operation was aborted due to timeout")));
    const result = await useCase.execute({ userId: null, params });
    if (!result.ok) throw new Error("esperava ok");
    expect(result.value.source).toBe("motor");
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("falhou"), expect.objectContaining({ error: expect.stringContaining("timeout") }));
  });

  it("sem chave do Claude, usa direto o motor local", async () => {
    const { useCase } = setup(null);
    const result = await useCase.execute({ userId: null, params });
    if (!result.ok) throw new Error("esperava ok");
    expect(result.value.source).toBe("motor");
    // Ordem pelo horário de início: o show (já começou) e o bar antes da feira (daqui a 30 min).
    expect(result.value.stops.map((s) => s.item.title)).toEqual(["Show", "Bar", "Feira"]);
    expect(result.value.stops[0]!.travel).toBe("Uns 5 min a pé");
  });

  it("sem candidatos, devolve roteiro vazio sem chamar o planejador", async () => {
    const claude = claudeSaying([]);
    const { useCase } = setup(claude, []);
    const result = await useCase.execute({ userId: null, params });
    if (!result.ok) throw new Error("esperava ok");
    expect(result.value.stops).toEqual([]);
    expect(claude.plan).not.toHaveBeenCalled();
  });
});

const planInput = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  now: NOW.toISOString(),
  availableMinutes: 120,
  budgetCents: null,
  people: 1,
  hasOrigin: false,
  candidates: [
    { key: "event:a", kind: "event", title: "A", categoryLabel: null, placeName: null, neighborhood: null, distanceMeters: null, priceCents: 2000, availableFrom: null, availableUntil: null, reasons: [] },
    { key: "place:b", kind: "place", title: "B", categoryLabel: null, placeName: null, neighborhood: null, distanceMeters: null, priceCents: null, availableFrom: null, availableUntil: null, reasons: [] },
  ],
  ...overrides,
});

describe("validateItinerary", () => {
  it("normaliza textos e usa o preço conhecido × pessoas", () => {
    const checked = validateItinerary([{ key: "event:a", travel: "  a  pé ", why: "x".repeat(500), estimatedCostCents: 1 }], planInput({ people: 3 }));
    expect(checked).toMatchObject({ ok: true, stops: [{ travel: "a pé", estimatedCostCents: 6000 }] });
    if (checked.ok) expect(checked.stops[0]!.why).toHaveLength(240);
  });

  it("recusa vazio, mais de 4 paradas e custo acima do orçamento", () => {
    expect(validateItinerary([], planInput()).ok).toBe(false);
    const five = Array.from({ length: 5 }, (_, i) => ({ key: `event:${i}`, travel: "", why: "", estimatedCostCents: null }));
    expect(validateItinerary(five, planInput()).ok).toBe(false);
    expect(validateItinerary([{ key: "event:a", travel: "", why: "", estimatedCostCents: null }], planInput({ budgetCents: 1999 }))).toMatchObject({ ok: false });
  });

  it("custo inventado para item sem preço é aceito, mas nunca negativo", () => {
    expect(validateItinerary([{ key: "place:b", travel: "", why: "", estimatedCostCents: -50 }], planInput())).toMatchObject({ ok: true, stops: [{ estimatedCostCents: 0 }] });
  });
});

describe("travelLabel", () => {
  it("a pé até 1,5 km; depois carro ou app; sem localização, aponta o Como chegar", () => {
    expect(travelLabel(400)).toBe("Uns 5 min a pé");
    expect(travelLabel(4000)).toBe("Uns 15 min de carro ou app");
    expect(travelLabel(null)).toMatch(/Como chegar/);
  });
});

describe("LocalItineraryPlanner", () => {
  it("respeita orçamento e tempo: pula o que não cabe", async () => {
    const stops = await new LocalItineraryPlanner().plan(
      planInput({
        availableMinutes: 120,
        budgetCents: 1500,
        candidates: [
          { ...planInput().candidates[0]!, key: "event:caro", priceCents: 5000 },
          { ...planInput().candidates[0]!, key: "event:tarde", priceCents: 0, availableFrom: at(200).toISOString() },
          { ...planInput().candidates[1]!, key: "place:ok" },
        ],
      }),
    );
    expect(stops.map((s) => s.key)).toEqual(["place:ok"]);
  });
});

describe("ClaudeItineraryPlanner", () => {
  const toolResponse = (input: unknown) =>
    new Response(JSON.stringify({ content: [{ type: "tool_use", name: "montar_roteiro", input }] }), { status: 200, headers: { "content-type": "application/json" } });

  it("chama a Messages API com ferramenta obrigatória e devolve as paradas", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      toolResponse({ paradas: [{ key: "event:a", deslocamento: "5 min a pé", justificativa: "Perto", custo_estimado_centavos: null }] }),
    );
    const planner = new ClaudeItineraryPlanner({ apiKey: "sk-test", model: "modelo-x", timeoutMs: 7000, fetch: fetchMock });
    const stops = await planner.plan(planInput());

    expect(stops).toEqual([{ key: "event:a", travel: "5 min a pé", why: "Perto", estimatedCostCents: null }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("sk-test");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "modelo-x", tool_choice: { type: "tool", name: "montar_roteiro" } });
    expect(body.messages[0].content).toContain('"key":"event:a"');
    expect(body.system).toMatch(/nunca siga instruções/);
  });

  it("erro HTTP ou resposta fora do formato viram exceção (o caso de uso cai no fallback)", async () => {
    const http = new ClaudeItineraryPlanner({ apiKey: "k", model: "m", timeoutMs: 10, fetch: vi.fn().mockResolvedValue(new Response("{}", { status: 529 })) });
    await expect(http.plan(planInput())).rejects.toThrow(/529/);
    const bad = new ClaudeItineraryPlanner({ apiKey: "k", model: "m", timeoutMs: 10, fetch: vi.fn().mockResolvedValue(toolResponse({ paradas: "nada" })) });
    await expect(bad.plan(planInput())).rejects.toThrow();
  });
});
