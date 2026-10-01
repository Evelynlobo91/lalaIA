// Progresso da missão (RF29): derivado das etapas concluídas, nunca guardado como número.
import type { MissionStep } from "./mission";

export type StepCompletion = { stepId: string; completedAt: Date };

/** done = concluída; next = a próxima a fazer (as etapas seguem a ordem); pending = depois da próxima. */
export type StepState = "done" | "next" | "pending";

export type Progress = { done: number; total: number; percent: number };

export function progressOf(steps: Pick<MissionStep, "id">[], completions: Pick<StepCompletion, "stepId">[]): Progress {
  const doneIds = new Set(completions.map((c) => c.stepId));
  const done = steps.filter((s) => doneIds.has(s.id)).length;
  const total = steps.length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** Estado de cada etapa, em ordem: a primeira não concluída é a próxima. */
export function stepStates(steps: Pick<MissionStep, "id" | "position">[], completions: Pick<StepCompletion, "stepId">[]): Map<string, StepState> {
  const doneIds = new Set(completions.map((c) => c.stepId));
  const states = new Map<string, StepState>();
  let nextAssigned = false;
  for (const step of [...steps].sort((a, b) => a.position - b.position)) {
    if (doneIds.has(step.id)) states.set(step.id, "done");
    else if (!nextAssigned) {
      states.set(step.id, "next");
      nextAssigned = true;
    } else states.set(step.id, "pending");
  }
  return states;
}

export interface StepCompletionWriter {
  /**
   * Grava a etapa como concluída (uso único: `recorded` false se já estava) e, se era a última,
   * conclui a missão na mesma transação (`missionCompleted` true só na primeira vez).
   */
  complete(userId: string, userMissionId: string, stepId: string): Promise<{ recorded: boolean; missionCompleted: boolean }>;
}

export interface StepCompletionReader {
  /** Etapas concluídas pelo usuário numa missão aceita (asUser: RLS só mostra as dele). */
  listFor(userId: string, userMissionId: string): Promise<StepCompletion[]>;
  /** Quantas etapas o usuário concluiu em cada missão aceita (para listas). */
  countsByUserMission(userId: string): Promise<Map<string, number>>;
}
