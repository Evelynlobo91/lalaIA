import type { DomainEventPublisher } from "@/shared/events";
import { BusinessRuleError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { isAvailable, xpSplit, type MissionRecord, type MissionRepository, type MissionStep } from "../../domain/mission";
import type { StepCompletionReader, StepCompletionWriter } from "../../domain/progress";
import type { StepProof, StepValidator } from "../../domain/step-validation";
import type { UserMission, UserMissionRepository } from "../../domain/user-mission";
import "../../domain/events";

export type CompleteStepInput = { stepId: string; proof: StepProof };

/** O que a pessoa vai concluir (prévia antes de confirmar). */
export type StepCheck = { mission: MissionRecord; step: MissionStep; userMission: UserMission; stepXp: number };

export type StepCompleted = { missionId: string; stepId: string; xp: number; missionCompleted: boolean; bonusXp: number };

/**
 * RF30 — Concluir uma etapa apresentando a prova (QR na POC). Genérico: a prova é conferida pela
 * estratégia do tipo de validação da etapa (`StepValidator`), então GPS entra sem mudar este caso de uso.
 *
 * Anti-fraude: prova válida (assinada, não expirada, desta etapa), missão aceita e ativa, dentro do
 * prazo, etapas em ordem e uso único por usuário/etapa (idempotente: repetir não credita de novo).
 */
export class CompleteStep {
  constructor(
    private readonly missions: Pick<MissionRepository, "findByStepId">,
    private readonly userMissions: Pick<UserMissionRepository, "find">,
    private readonly completions: Pick<StepCompletionReader, "listFor"> & StepCompletionWriter,
    private readonly validators: StepValidator[],
    private readonly bus: DomainEventPublisher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Todas as regras, sem gravar nada: usada na tela de confirmação. */
  async check(userId: string, input: CompleteStepInput): Promise<Result<StepCheck, DomainError>> {
    const mission = await this.missions.findByStepId(input.stepId);
    const step = mission?.steps.find((s) => s.id === input.stepId);
    if (!mission || !step) return err(new NotFoundError("Etapa"));

    const validator = this.validators.find((v) => v.kind === step.validation);
    if (!validator) return err(new BusinessRuleError("validation_unsupported", "Esta etapa ainda não pode ser validada por aqui."));
    const now = this.now();
    // A prova vem antes de tudo: sem ela, não revelamos nada sobre o estado da missão.
    const proof = await validator.validate(step, input.proof, { userId, now });
    if (!proof.ok) return proof;

    const userMission = await this.userMissions.find(userId, mission.id);
    if (!userMission) return err(new BusinessRuleError("mission_not_accepted", "Aceite a missão antes de validar as etapas.", { missionId: mission.id }));
    if (userMission.status === "completed") return err(new BusinessRuleError("mission_already_completed", "Você já concluiu esta missão.", { missionId: mission.id }));
    if (!isAvailable(mission, now)) return err(new BusinessRuleError("mission_unavailable", "Esta missão não está mais valendo.", { missionId: mission.id }));

    const done = new Set((await this.completions.listFor(userId, userMission.id)).map((c) => c.stepId));
    if (done.has(step.id)) return err(new BusinessRuleError("step_already_completed", "Você já concluiu esta etapa. O QR code só vale uma vez.", { missionId: mission.id }));
    const pending = mission.steps.filter((s) => s.position < step.position && !done.has(s.id)).sort((a, b) => a.position - b.position)[0];
    if (pending) {
      return err(new BusinessRuleError("step_out_of_order", `As etapas seguem a ordem: conclua antes a etapa ${pending.position} (${pending.title}).`, { missionId: mission.id }));
    }

    return ok({ mission, step, userMission, stepXp: xpSplit(mission.xp, mission.steps.length).perStep });
  }

  async execute(userId: string, input: CompleteStepInput): Promise<Result<StepCompleted, DomainError>> {
    const checked = await this.check(userId, input);
    if (!checked.ok) return checked;
    const { mission, step, userMission } = checked.value;

    const saved = await this.completions.complete(userId, userMission.id, step.id);
    // Duas leituras ao mesmo tempo: a segunda bate no unique e não credita de novo.
    if (!saved.recorded) return err(new BusinessRuleError("step_already_completed", "Você já concluiu esta etapa. O QR code só vale uma vez.", { missionId: mission.id }));

    const { perStep, completionBonus } = xpSplit(mission.xp, mission.steps.length);
    // Publicado DEPOIS de gravar; quem dá o XP é o módulo progression (assinante).
    await this.bus.publish("missions.StepCompleted", { userId, missionId: mission.id, stepId: step.id, xp: perStep });
    if (saved.missionCompleted) await this.bus.publish("missions.MissionCompleted", { userId, missionId: mission.id, xp: completionBonus });

    return ok({ missionId: mission.id, stepId: step.id, xp: perStep, missionCompleted: saved.missionCompleted, bonusXp: saved.missionCompleted ? completionBonus : 0 });
  }
}
