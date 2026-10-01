import { describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "@/shared/events";
import type { NewXpTransaction, XpLedger } from "../../domain/xp";
import { GetXpOverview, GrantXp } from "./xp-ledger.use-case";

const ANA = "11111111-1111-4111-8111-111111111111";
const MISSAO = "22222222-2222-4222-8222-222222222222";
const ETAPA = "33333333-3333-4333-8333-333333333333";
const EVT = "44444444-4444-4444-8444-444444444444";

/** Livro em memória com as mesmas chaves únicas do banco (evento e origem). */
function memoryLedger() {
  const rows: NewXpTransaction[] = [];
  const ledger: Pick<XpLedger, "append"> = {
    append: vi.fn(async (e: NewXpTransaction) => {
      if (rows.some((r) => r.eventId === e.eventId || (r.userId === e.userId && r.reason === e.reason && r.sourceId === e.sourceId))) return false;
      rows.push(e);
      return true;
    }),
  };
  return { rows, ledger };
}
const titles = { titleOf: vi.fn().mockResolvedValue("Rota do Café") };
const events = () => ({ publish: vi.fn().mockResolvedValue(undefined) });

describe("GrantXp", () => {
  it("credita o XP da etapa com descrição congelada", async () => {
    const { rows, ledger } = memoryLedger();
    const credited = await new GrantXp(ledger, titles, events()).onStepCompleted({ id: EVT, payload: { userId: ANA, missionId: MISSAO, stepId: ETAPA, xp: 30 } });
    expect(credited).toBe(true);
    expect(rows).toEqual([{ eventId: EVT, userId: ANA, reason: "mission_step", sourceId: ETAPA, amount: 30, description: "Etapa concluída · Rota do Café" }]);
  });

  it("credita o bônus da missão", async () => {
    const { rows, ledger } = memoryLedger();
    await new GrantXp(ledger, titles, events()).onMissionCompleted({ id: EVT, payload: { userId: ANA, missionId: MISSAO, xp: 25 } });
    expect(rows[0]).toMatchObject({ reason: "mission_completed", sourceId: MISSAO, amount: 25, description: "Missão concluída · Rota do Café" });
  });

  it("idempotente: o mesmo evento, ou o mesmo fato republicado com outro id, não credita duas vezes", async () => {
    const { rows, ledger } = memoryLedger();
    const grant = new GrantXp(ledger, titles, events());
    const payload = { userId: ANA, missionId: MISSAO, stepId: ETAPA, xp: 30 };
    expect(await grant.onStepCompleted({ id: EVT, payload })).toBe(true);
    expect(await grant.onStepCompleted({ id: EVT, payload })).toBe(false);
    expect(await grant.onStepCompleted({ id: crypto.randomUUID(), payload })).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it("publica progression.XpGranted só quando o crédito é novo (depois de gravar)", async () => {
    const { ledger } = memoryLedger();
    const bus = events();
    const grant = new GrantXp(ledger, titles, bus);
    const payload = { userId: ANA, missionId: MISSAO, stepId: ETAPA, xp: 30 };
    await grant.onStepCompleted({ id: EVT, payload });
    await grant.onStepCompleted({ id: EVT, payload });
    expect(bus.publish).toHaveBeenCalledOnce();
    expect(bus.publish).toHaveBeenCalledWith("progression.XpGranted", { userId: ANA, amount: 30, reason: "mission_step" });
  });

  it("sem título da missão, usa só o rótulo", async () => {
    const { rows, ledger } = memoryLedger();
    await new GrantXp(ledger, { titleOf: vi.fn().mockRejectedValue(new Error("fora do ar")) }, events()).onMissionCompleted({ id: EVT, payload: { userId: ANA, missionId: MISSAO, xp: 25 } });
    expect(rows[0].description).toBe("Missão concluída");
  });

  it.each([
    ["XP negativo", { userId: ANA, missionId: MISSAO, stepId: ETAPA, xp: -5 }],
    ["sem usuário", { missionId: MISSAO, stepId: ETAPA, xp: 10 }],
    ["id inválido", { userId: "x", missionId: MISSAO, stepId: ETAPA, xp: 10 }],
  ])("payload inválido (%s) não credita", async (_, payload) => {
    const { rows, ledger } = memoryLedger();
    await expect(new GrantXp(ledger, titles, events()).onStepCompleted({ id: EVT, payload })).rejects.toThrow();
    expect(rows).toHaveLength(0);
  });

  it("via event bus: StepCompleted e MissionCompleted viram transações (handlers assinados como no módulo)", async () => {
    const { rows, ledger } = memoryLedger();
    const grant = new GrantXp(ledger, titles, events());
    const bus = new InMemoryEventBus();
    bus.subscribe("missions.StepCompleted", async (e) => void (await grant.onStepCompleted(e)));
    bus.subscribe("missions.MissionCompleted", async (e) => void (await grant.onMissionCompleted(e)));
    await bus.publish("missions.StepCompleted", { userId: ANA, missionId: MISSAO, stepId: ETAPA, xp: 50 });
    await bus.publish("missions.MissionCompleted", { userId: ANA, missionId: MISSAO, xp: 50 });
    expect(rows.map((r) => [r.reason, r.amount])).toEqual([
      ["mission_step", 50],
      ["mission_completed", 50],
    ]);
  });
});

describe("GetXpOverview", () => {
  it("saldo e histórico do usuário", async () => {
    const ledger = { balanceOf: vi.fn().mockResolvedValue(80), history: vi.fn().mockResolvedValue([]) };
    expect(await new GetXpOverview(ledger).execute(ANA, 5)).toEqual({ balance: 80, history: [] });
    expect(ledger.history).toHaveBeenCalledWith(ANA, 5);
  });
});
