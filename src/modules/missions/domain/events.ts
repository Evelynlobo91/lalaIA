// Eventos de domínio do módulo missions (payload só com ids e o XP ganho).
// Missões não concedem XP diretamente: o módulo progression assina estes eventos (epic #9).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    "missions.StepCompleted": { userId: string; missionId: string; stepId: string; xp: number };
    "missions.MissionCompleted": { userId: string; missionId: string; xp: number };
    /** Quem concluiu a missão resgatou a recompensa do parceiro (#62); só na primeira vez. */
    "missions.RewardClaimed": { userId: string; missionId: string; claimId: string };
    /** O parceiro validou o código da recompensa no balcão. `userId` é quem resgatou. */
    "missions.RewardValidated": { userId: string; missionId: string; claimId: string; validatedBy: string };
    /** Admin editou ou encerrou a missão de outra pessoa (auditoria, #146). */
    "missions.MissionEditedByAdmin": { missionId: string; editedBy: string };
    "missions.MissionArchivedByAdmin": { missionId: string; archivedBy: string };
  }
}

export {};
