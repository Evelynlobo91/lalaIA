// Eventos de domínio do módulo missions (payload só com ids e o XP ganho).
// Missões não concedem XP diretamente: o módulo progression assina estes eventos (epic #9).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    "missions.StepCompleted": { userId: string; missionId: string; stepId: string; xp: number };
    "missions.MissionCompleted": { userId: string; missionId: string; xp: number };
  }
}

export {};
