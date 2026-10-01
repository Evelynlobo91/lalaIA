// API pública do módulo missions (missões urbanas).
import { cache } from "react";
import { toLocalInput } from "@/shared/time/joinville-time";
import { getMissionProgress, listAvailableMissions, listMyMissions, missionPlaces, missionRepository, qrStepValidation, stepQrCodes, userMissionRepository } from "./composition";
import { qrModeSchema, qrTokenSchema } from "./features/qr-validation/qr-validation.schema";
import "./domain/events";
import { missionIdSchema } from "./features/mission-progress/mission-progress.schema";
import { xpSplit, type MissionRecord } from "./domain/mission";
import type { MissionFormValues, PlaceOption } from "./features/manage-missions/ui/mission-form";

export { MissionForm, type MissionFormValues, type PlaceOption } from "./features/manage-missions/ui/mission-form";
export { ArchiveMissionButton } from "./features/manage-missions/ui/archive-mission-button";
export { isAvailable, xpSplit, type MissionRecord, type MissionStatus, type MissionStep } from "./domain/mission";
export { MAX_ACTIVE_MISSIONS, type UserMission, type UserMissionStatus } from "./domain/user-mission";
export type { MissionCard, MyMission } from "./features/accept-mission/mission-catalog";
export { MissionCardView } from "./features/accept-mission/ui/mission-card";
export { AcceptMissionButton } from "./features/accept-mission/ui/accept-mission-button";
export { ActiveMissionsCard } from "./features/accept-mission/ui/active-missions-card";
export { MissionProgressPanel } from "./features/mission-progress/ui/mission-progress-view";
export type { MissionProgressView, StepProgressView } from "./features/mission-progress/mission-progress.use-case";
export type { Progress, StepState } from "./domain/progress";
export { ConfirmStepForm } from "./features/qr-validation/ui/confirm-step-form";
export { StepQrGrid } from "./features/qr-validation/ui/step-qr-grid";
export { QrAutoRefresh } from "./features/qr-validation/ui/qr-auto-refresh";
export { PrintButton } from "./features/qr-validation/ui/print-button";
export { QR_ROTATION_SECONDS } from "./domain/step-validation";
export type { MissionQrCodes, QrMode } from "./features/qr-validation/step-qr-codes.use-case";
export type { StepCheck, StepCompleted } from "./features/qr-validation/complete-step.use-case";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Missões criadas por alguém (portal do parceiro), da mais recente para a mais antiga. */
export function missionsByOwner(ownerId: string): Promise<MissionRecord[]> {
  return missionRepository().listByOwner(ownerId);
}

/** Lugares que o parceiro pode usar nas etapas (os que ele administra), já como opções do formulário. */
export async function missionPlaceOptions(userId: string): Promise<PlaceOption[]> {
  const places = await missionPlaces.managedBy(userId);
  return places.map((p) => ({ id: p.id, label: p.neighborhood ? `${p.name} · ${p.neighborhood}` : p.name }));
}

/** Missões disponíveis agora (ativas e dentro da janela), para a lista pública. */
export function availableMissions() {
  return listAvailableMissions().execute();
}

/** Missões aceitas pelo usuário (ativas e concluídas). O id vem sempre da sessão. */
export function myMissions(userId: string) {
  return listMyMissions().execute(userId);
}

/**
 * Tela da missão (/missoes/[id]): etapas, status e percentual. null para id inválido ou missão que a pessoa não pode ver.
 * Memoizado por requisição (página e metadados fazem uma consulta só).
 */
export const missionProgress = cache(async (userId: string | null, missionId: string) => {
  if (!missionIdSchema.safeParse(missionId).success) return null;
  const result = await getMissionProgress().execute(userId, missionId);
  return result.ok ? result.value : null;
});

/** QR codes das etapas (portal do parceiro): só o dono (ou admin) e missão ativa; null para os demais. */
export async function missionQrCodes(viewer: { id: string; isAdmin: boolean }, missionId: string, mode: string) {
  const parsedMode = qrModeSchema.safeParse(mode);
  if (!missionIdSchema.safeParse(missionId).success || !parsedMode.success) return null;
  const result = await stepQrCodes().execute(viewer, missionId, parsedMode.data);
  return result.ok ? result.value : null;
}

/**
 * Prévia da validação por QR (/missoes/validar?t=): confere assinatura, validade, aceite, ordem e uso
 * único SEM gravar. A conclusão acontece no POST do `ConfirmStepForm`.
 */
export async function inspectStepQr(userId: string, token: string) {
  const parsed = qrTokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false as const, code: "qr_invalid", message: "Este QR code não é válido.", missionId: null };
  const result = await qrStepValidation().check(userId, parsed.data);
  if (result.ok) {
    const { mission, step, stepXp } = result.value;
    const [place] = await missionPlaces.summaries([step.placeId]);
    return {
      ok: true as const,
      token: parsed.data,
      mission: { id: mission.id, title: mission.title, totalSteps: mission.steps.length },
      step: { id: step.id, position: step.position, title: step.title, placeName: place?.name ?? null },
      stepXp,
    };
  }
  const details = result.error.details as { missionId?: string } | undefined;
  return { ok: false as const, code: result.error.code, message: result.error.message, missionId: details?.missionId ?? null };
}

/** Missão para o formulário de edição: só para o dono (ou admin) e enquanto ativa; null para os demais. */
export async function editableMission(editor: { id: string; isAdmin: boolean }, missionId: string): Promise<{ mission: MissionRecord; stepsLocked: boolean; values: MissionFormValues } | null> {
  if (!UUID.test(missionId)) return null;
  const mission = await missionRepository().findById(missionId);
  if (!mission || (mission.ownerId !== editor.id && !editor.isAdmin) || mission.status !== "active") return null;
  return {
    mission,
    /** Já aceita por alguém: etapas e XP ficam travados. */
    stepsLocked: await userMissionRepository().hasParticipants(mission.id),
    values: {
      missionId: mission.id,
      title: mission.title,
      description: mission.description,
      xp: String(mission.xp),
      startsAt: toLocalInput(mission.startsAt),
      endsAt: toLocalInput(mission.endsAt),
      steps: mission.steps.map((s) => ({ title: s.title, placeId: s.placeId })),
    },
  };
}

/** "25 XP por etapa + 25 XP de bônus" (para telas). */
export function xpBreakdown(mission: Pick<MissionRecord, "xp" | "steps">): string {
  const { perStep, completionBonus } = xpSplit(mission.xp, mission.steps.length);
  return `${perStep} XP por etapa + ${completionBonus} XP de bônus`;
}
