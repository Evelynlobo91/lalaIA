import { describe, expect, it, vi } from "vitest";
import { ok } from "@/shared/kernel";
import type { MissionRecord } from "../../domain/mission";
import type { StepValidator } from "../../domain/step-validation";
import type { UserMission } from "../../domain/user-mission";
import { HmacStepTokens } from "../../infra/hmac-step-tokens";
import { CompleteStep } from "./complete-step.use-case";
import { QrCodeValidator } from "./qr-code-validator";
import { QrStepValidation } from "./qr-validation.use-case";
import { GetStepQrCodes } from "./step-qr-codes.use-case";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const OUTRA = "33333333-3333-4333-8333-333333333333";
const now = () => new Date("2026-10-15T12:00:00Z");
const tokens = new HmacStepTokens("segredo-de-teste-com-mais-de-32-caracteres!!");
const valid = (stepId: string) => tokens.sign(stepId, new Date(now().getTime() + 5 * 60_000));

const mission = (patch: Partial<MissionRecord> = {}): MissionRecord => ({
  id: "m1",
  ownerId: "parceiro",
  title: "Rota do Café",
  description: "Conheça os cafés do Centro.",
  xp: 90,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-10-31T00:00:00Z"),
  status: "active",
  createdAt: new Date("2026-09-30T00:00:00Z"),
  steps: [
    { id: S1, missionId: "m1", position: 1, title: "Espresso", placeId: "cafe", validation: "qr" },
    { id: S2, missionId: "m1", position: 2, title: "Chope", placeId: "bar", validation: "qr" },
  ],
  ...patch,
});
const accepted = (patch: Partial<UserMission> = {}): UserMission => ({ id: "um1", userId: "ana", missionId: "m1", status: "active", acceptedAt: now(), completedAt: null, ...patch });

function setup(opts: { m?: MissionRecord | null; um?: UserMission | null; done?: string[]; saved?: { recorded: boolean; missionCompleted: boolean }; validators?: StepValidator[] } = {}) {
  const m = opts.m === undefined ? mission() : opts.m;
  const completions = {
    listFor: vi.fn().mockResolvedValue((opts.done ?? []).map((stepId) => ({ stepId, completedAt: now() }))),
    complete: vi.fn().mockResolvedValue(opts.saved ?? { recorded: true, missionCompleted: false }),
  };
  const bus = { publish: vi.fn().mockResolvedValue(undefined) };
  const useCase = new CompleteStep(
    { findByStepId: vi.fn(async (id: string) => (m?.steps.some((s) => s.id === id) ? m : null)) },
    { find: vi.fn().mockResolvedValue(opts.um === undefined ? accepted() : opts.um) },
    completions,
    opts.validators ?? [new QrCodeValidator(tokens)],
    bus,
    now,
  );
  return { qr: new QrStepValidation(tokens, useCase), useCase, completions, bus };
}

describe("validar etapa por QR (CompleteStep + QrCodeValidator)", () => {
  it("leitura válida conclui a etapa e publica missions.StepCompleted com o XP da etapa", async () => {
    const { qr, completions, bus } = setup();
    const res = await qr.execute("ana", valid(S1));
    expect(res.ok && res.value).toEqual({ missionId: "m1", stepId: S1, xp: 30, missionCompleted: false, bonusXp: 0 });
    expect(completions.complete).toHaveBeenCalledWith("ana", "um1", S1);
    expect(bus.publish).toHaveBeenCalledTimes(1);
    expect(bus.publish).toHaveBeenCalledWith("missions.StepCompleted", { userId: "ana", missionId: "m1", stepId: S1, xp: 30 });
  });

  it("última etapa conclui a missão e publica missions.MissionCompleted com o bônus", async () => {
    const { qr, bus } = setup({ done: [S1], saved: { recorded: true, missionCompleted: true } });
    const res = await qr.execute("ana", valid(S2));
    expect(res.ok && res.value).toMatchObject({ missionCompleted: true, xp: 30, bonusXp: 30 });
    expect(bus.publish).toHaveBeenNthCalledWith(1, "missions.StepCompleted", { userId: "ana", missionId: "m1", stepId: S2, xp: 30 });
    expect(bus.publish).toHaveBeenNthCalledWith(2, "missions.MissionCompleted", { userId: "ana", missionId: "m1", xp: 30 });
  });

  it.each([
    ["assinatura inválida", () => valid(S1).slice(0, -2) + "xx", "qr_invalid"],
    ["expirado", () => tokens.sign(S1, new Date(now().getTime() - 1000)), "qr_expired"],
    ["lixo", () => "nao-e-um-token", "qr_invalid"],
  ])("QR com %s é rejeitado sem gravar nada", async (_, token, code) => {
    const { qr, completions, bus } = setup();
    const res = await qr.execute("ana", token());
    expect(!res.ok && res.error.code).toBe(code);
    expect(completions.complete).not.toHaveBeenCalled();
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("QR reutilizado (etapa já concluída) é rejeitado e não credita de novo", async () => {
    const { qr, completions, bus } = setup({ done: [S1] });
    const res = await qr.execute("ana", valid(S1));
    expect(!res.ok && res.error.code).toBe("step_already_completed");
    expect(completions.complete).not.toHaveBeenCalled();
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("corrida: se o banco diz que já estava gravada (unique), não publica", async () => {
    const { qr, bus } = setup({ saved: { recorded: false, missionCompleted: false } });
    const res = await qr.execute("ana", valid(S1));
    expect(!res.ok && res.error.code).toBe("step_already_completed");
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("etapa fora da missão: QR de etapa inexistente → 404; token de uma etapa usado como prova de outra → inválido", async () => {
    const { qr } = setup();
    const unknown = await qr.execute("ana", valid(OUTRA));
    expect(!unknown.ok && unknown.error.code).toBe("not_found");

    const { useCase } = setup();
    const swapped = await useCase.execute("ana", { stepId: S2, proof: { kind: "qr", token: valid(S1) } });
    expect(!swapped.ok && swapped.error.code).toBe("qr_invalid");
  });

  it("não aceitou a missão → recusa (com o id da missão para o link)", async () => {
    const { qr, completions } = setup({ um: null });
    const res = await qr.execute("ana", valid(S1));
    expect(!res.ok && res.error.code).toBe("mission_not_accepted");
    expect(!res.ok && res.error.details).toEqual({ missionId: "m1" });
    expect(completions.complete).not.toHaveBeenCalled();
  });

  it.each([
    ["fora de ordem", { done: [] as string[] }, S2, "step_out_of_order"],
    ["missão já concluída", { um: accepted({ status: "completed", completedAt: now() }) }, S1, "mission_already_completed"],
    ["missão encerrada", { m: mission({ status: "archived" }) }, S1, "mission_unavailable"],
    ["missão fora do prazo", { m: mission({ endsAt: new Date("2026-10-10T00:00:00Z") }) }, S1, "mission_unavailable"],
  ])("recusa etapa %s", async (_, opts, stepId, code) => {
    const { qr, completions } = setup(opts);
    const res = await qr.execute("ana", valid(stepId));
    expect(!res.ok && res.error.code).toBe(code);
    expect(completions.complete).not.toHaveBeenCalled();
  });

  it("check() confere tudo sem gravar (tela de confirmação)", async () => {
    const { qr, completions, bus } = setup();
    const res = await qr.check("ana", valid(S1));
    expect(res.ok && res.value.step.id).toBe(S1);
    expect(res.ok && res.value.stepXp).toBe(30);
    expect(completions.complete).not.toHaveBeenCalled();
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("usa a estratégia do tipo de validação da etapa (OCP)", async () => {
    const stub: StepValidator = { kind: "qr", validate: vi.fn().mockReturnValue(ok(undefined)) };
    const { useCase } = setup({ validators: [stub] });
    expect((await useCase.execute("ana", { stepId: S1, proof: { kind: "qr", token: "qualquer" } })).ok).toBe(true);
    expect(stub.validate).toHaveBeenCalledWith(expect.objectContaining({ id: S1 }), { kind: "qr", token: "qualquer" }, { userId: "ana", now: now(), dryRun: false });
    // A prévia (GET do link) avisa a estratégia para não gravar nada.
    await useCase.check("ana", { stepId: S1, proof: { kind: "qr", token: "qualquer" } });
    expect(stub.validate).toHaveBeenLastCalledWith(expect.objectContaining({ id: S1 }), { kind: "qr", token: "qualquer" }, { userId: "ana", now: now(), dryRun: true });

    const { useCase: semEstrategia } = setup({ validators: [] });
    const res = await semEstrategia.execute("ana", { stepId: S1, proof: { kind: "qr", token: valid(S1) } });
    expect(!res.ok && res.error.code).toBe("validation_unsupported");
  });
});

describe("GetStepQrCodes (portal do parceiro)", () => {
  const places = { summaries: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, name: `Lugar ${id}`, neighborhood: null }))) };
  const renderer = { svg: vi.fn(async (text: string) => `<svg data-text="${text.length}"></svg>`) };
  const make = (m: MissionRecord | null = mission()) =>
    new GetStepQrCodes({ findById: vi.fn().mockResolvedValue(m) }, places, tokens, renderer, () => "https://lalaia.app", now);

  it("dono recebe um QR por etapa com URL assinada que leva à validação", async () => {
    const res = await make().execute({ id: "parceiro", isAdmin: false }, "m1", "screen");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.steps).toHaveLength(2);
    const url = new URL(res.value.steps[0].url);
    expect(url.origin + url.pathname).toBe("https://lalaia.app/missoes/validar");
    const verified = tokens.verify(url.searchParams.get("t")!, now());
    expect(verified.ok && verified.value.stepId).toBe(S1);
    expect(res.value.expiresAt.toISOString()).toBe("2026-10-15T12:04:00.000Z");
  });

  it("versão para imprimir vale até o fim do dia", async () => {
    const res = await make().execute({ id: "parceiro", isAdmin: false }, "m1", "print");
    expect(res.ok && res.value.expiresAt.toISOString()).toBe("2026-10-16T02:59:59.000Z");
  });

  it("outro parceiro (ou missão encerrada) não gera QR", async () => {
    expect((await make().execute({ id: "outro", isAdmin: false }, "m1", "screen")).ok).toBe(false);
    expect((await make(mission({ status: "archived" })).execute({ id: "parceiro", isAdmin: false }, "m1", "screen")).ok).toBe(false);
    expect((await make().execute({ id: "admin", isAdmin: true }, "m1", "screen")).ok).toBe(true);
  });
});
