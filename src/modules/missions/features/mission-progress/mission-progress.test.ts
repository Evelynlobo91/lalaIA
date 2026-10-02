import { describe, expect, it, vi } from "vitest";
import type { MissionRecord } from "../../domain/mission";
import { progressOf, stepStates } from "../../domain/progress";
import type { UserMission } from "../../domain/user-mission";
import { GetMissionProgress } from "./mission-progress.use-case";
import { missionIdSchema } from "./mission-progress.schema";

const now = () => new Date("2026-10-15T12:00:00Z");
const steps = [
  { id: "s1", missionId: "m1", position: 1, title: "Espresso", placeId: "cafe", validation: "qr" as const },
  { id: "s2", missionId: "m1", position: 2, title: "Bolo", placeId: "cafe", validation: "qr" as const },
  { id: "s3", missionId: "m1", position: 3, title: "Chope", placeId: "bar", validation: "qr" as const },
];
const mission = (patch: Partial<MissionRecord> = {}): MissionRecord => ({
  id: "m1",
  ownerId: "parceiro",
  title: "Rota do Café",
  description: "Conheça os cafés do Centro.",
  xp: 100,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-10-31T00:00:00Z"),
  status: "active",
  createdAt: new Date("2026-09-30T00:00:00Z"),
  steps,
  ...patch,
});
const accepted: UserMission = { id: "um1", userId: "ana", missionId: "m1", status: "active", acceptedAt: now(), completedAt: null };
const places = { summaries: vi.fn(async (ids: string[]) => ids.filter((id) => id !== "sumiu").map((id) => ({ id, name: id === "cafe" ? "Café Central" : "Bar do Zé", neighborhood: "Centro" }))) };

function useCase(opts: { m?: MissionRecord | null; um?: UserMission | null; done?: string[] } = {}) {
  const completions = { listFor: vi.fn().mockResolvedValue((opts.done ?? []).map((stepId) => ({ stepId, completedAt: now() }))) };
  return {
    completions,
    get: new GetMissionProgress(
      { findById: vi.fn().mockResolvedValue(opts.m === undefined ? mission() : opts.m) },
      { find: vi.fn().mockResolvedValue(opts.um === undefined ? accepted : opts.um) },
      completions,
      places,
      now,
    ),
  };
}

describe("progresso derivado das etapas concluídas", () => {
  it("percentual arredondado e estado de cada etapa em ordem", () => {
    expect(progressOf(steps, [{ stepId: "s1" }])).toEqual({ done: 1, total: 3, percent: 33 });
    expect(progressOf(steps, [])).toEqual({ done: 0, total: 3, percent: 0 });
    expect(progressOf(steps, steps.map((s) => ({ stepId: s.id })))).toEqual({ done: 3, total: 3, percent: 100 });
    expect(Object.fromEntries(stepStates(steps, [{ stepId: "s1" }]))).toEqual({ s1: "done", s2: "next", s3: "pending" });
  });

  it("conclusão de etapa de outra missão não conta", () => {
    expect(progressOf(steps, [{ stepId: "de-outra-missao" }]).done).toBe(0);
  });
});

describe("GetMissionProgress", () => {
  it("mostra etapas feitas/pendentes, percentual e o lugar de cada etapa", async () => {
    const res = await useCase({ done: ["s1"] }).get.execute("ana", "m1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.progress).toEqual({ done: 1, total: 3, percent: 33 });
    expect(res.value.xp).toEqual({ perStep: 25, completionBonus: 25 });
    expect(res.value.steps.map((s) => [s.id, s.state, s.place?.name])).toEqual([
      ["s1", "done", "Café Central"],
      ["s2", "next", "Café Central"],
      ["s3", "pending", "Bar do Zé"],
    ]);
  });

  it("visitante vê a missão disponível sem progresso (e sem consultar conclusões)", async () => {
    const { get, completions } = useCase({ um: null });
    const res = await get.execute(null, "m1");
    expect(res.ok && res.value.userMission).toBeNull();
    expect(res.ok && res.value.steps.every((s) => s.state === "pending")).toBe(true);
    expect(completions.listFor).not.toHaveBeenCalled();
  });

  it("missão encerrada ou fora da janela: só quem aceitou vê", async () => {
    const archived = mission({ status: "archived" });
    expect((await useCase({ m: archived, um: null }).get.execute("bia", "m1")).ok).toBe(false);
    expect((await useCase({ m: archived }).get.execute("ana", "m1")).ok).toBe(true);
  });

  it("missão inexistente → 404", async () => {
    const res = await useCase({ m: null }).get.execute("ana", "m1");
    expect(!res.ok && res.error.code).toBe("not_found");
  });

  it("id da URL precisa ser uuid", () => {
    expect(missionIdSchema.safeParse("1 or 1=1").success).toBe(false);
    expect(missionIdSchema.safeParse("8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f").success).toBe(true);
  });
});
