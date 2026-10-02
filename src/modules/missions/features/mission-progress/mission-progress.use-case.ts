import { NotFoundError, err, ok, type Result } from "@/shared/kernel";
import { geofenceFor } from "../../domain/geofence";
import { isAvailable, xpSplit, type MissionPlace, type MissionPlaces, type MissionRecord, type MissionRepository, type StepGeofence, type ValidationKind } from "../../domain/mission";
import { progressOf, stepStates, type Progress, type StepCompletionReader, type StepState } from "../../domain/progress";
import { isOpen, revealedStepIds, type SurpriseOfferRepository } from "../../domain/surprise";
import type { UserMission, UserMissionRepository } from "../../domain/user-mission";

export type StepProgressView = {
  id: string;
  position: number;
  /** "Etapa surpresa" enquanto escondida (#63). */
  title: string;
  /** Etapa de missão surpresa ainda não revelada: sem título, lugar nem geofence. */
  hidden: boolean;
  validation: ValidationKind;
  /** Raio e permanência das etapas com GPS (#61); null nas de QR. */
  geofence: StepGeofence | null;
  place: MissionPlace | null;
  state: StepState;
  completedAt: Date | null;
};

export type MissionProgressView = {
  mission: Pick<MissionRecord, "id" | "title" | "description" | "xp" | "startsAt" | "endsAt" | "status"> & { available: boolean; surprise: boolean };
  xp: { perStep: number; completionBonus: number };
  /** null: visitante ou quem ainda não aceitou. */
  userMission: UserMission | null;
  /** Missão surpresa oferecida e ainda não respondida: até quando dá para aceitar. */
  surpriseOffer: { expiresAt: Date } | null;
  progress: Progress;
  steps: StepProgressView[];
};

export const HIDDEN_STEP_TITLE = "Etapa surpresa";

/**
 * RF29 — Etapas da missão com o status de cada uma (feita/próxima/pendente) e o percentual concluído.
 * Missão surpresa (#63): só aparece para quem a aceitou ou tem a oferta aberta, e revela uma etapa por vez.
 */
export class GetMissionProgress {
  constructor(
    private readonly missions: Pick<MissionRepository, "findById">,
    private readonly userMissions: Pick<UserMissionRepository, "find">,
    private readonly completions: Pick<StepCompletionReader, "listFor">,
    private readonly places: Pick<MissionPlaces, "summaries">,
    private readonly offers: Pick<SurpriseOfferRepository, "find">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** `userId` vem da sessão (ou null para visitante). */
  async execute(userId: string | null, missionId: string): Promise<Result<MissionProgressView, NotFoundError>> {
    const mission = await this.missions.findById(missionId);
    if (!mission) return err(new NotFoundError("Missão"));

    const now = this.now();
    const userMission = userId ? await this.userMissions.find(userId, missionId) : null;
    const available = isAvailable(mission, now);
    // Missão fora da janela ou encerrada só aparece para quem já a aceitou.
    if (!available && !userMission) return err(new NotFoundError("Missão"));

    const surprise = mission.surprise ?? false;
    const offer = surprise && userId && !userMission ? await this.offers.find(userId, missionId) : null;
    const openOffer = offer && isOpen(offer, now) ? offer : null;
    // Surpresa não é pública: sem aceite nem oferta aberta, "não existe" (não revela que existe).
    if (surprise && !userMission && !openOffer) return err(new NotFoundError("Missão"));

    const completions = userMission && userId ? await this.completions.listFor(userId, userMission.id) : [];
    const doneIds = new Set(completions.map((c) => c.stepId));
    const visible = surprise ? revealedStepIds(mission.steps, userMission, doneIds) : new Set(mission.steps.map((s) => s.id));
    // Só consulta os lugares das etapas visíveis: os escondidos não saem do servidor.
    const places = await this.places.summaries([...new Set(mission.steps.filter((s) => visible.has(s.id)).map((s) => s.placeId))]);
    const placeById = new Map(places.map((p) => [p.id, { id: p.id, name: p.name, neighborhood: p.neighborhood }]));
    const completedAt = new Map(completions.map((c) => [c.stepId, c.completedAt]));
    const states = stepStates(mission.steps, completions);

    return ok({
      mission: {
        id: mission.id,
        title: mission.title,
        description: mission.description,
        xp: mission.xp,
        startsAt: mission.startsAt,
        endsAt: mission.endsAt,
        status: mission.status,
        available,
        surprise,
      },
      xp: xpSplit(mission.xp, mission.steps.length),
      userMission,
      surpriseOffer: openOffer ? { expiresAt: openOffer.expiresAt } : null,
      progress: progressOf(mission.steps, completions),
      steps: mission.steps.map((s) => {
        const hidden = !visible.has(s.id);
        return {
          id: s.id,
          position: s.position,
          title: hidden ? HIDDEN_STEP_TITLE : s.title,
          hidden,
          validation: s.validation,
          geofence: hidden ? null : geofenceFor(s.validation, s.geofence),
          place: hidden ? null : (placeById.get(s.placeId) ?? null),
          state: userMission ? states.get(s.id)! : "pending",
          completedAt: completedAt.get(s.id) ?? null,
        };
      }),
    });
  }
}
