// API pública do módulo missions (missões urbanas).
import { toLocalInput } from "@/shared/time/joinville-time";
import { missionPlaces, missionRepository } from "./composition";
import { xpSplit, type MissionRecord } from "./domain/mission";
import type { MissionFormValues, PlaceOption } from "./features/manage-missions/ui/mission-form";

export { MissionForm, type MissionFormValues, type PlaceOption } from "./features/manage-missions/ui/mission-form";
export { ArchiveMissionButton } from "./features/manage-missions/ui/archive-mission-button";
export { isAvailable, xpSplit, type MissionRecord, type MissionStatus, type MissionStep } from "./domain/mission";

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

/** Missão para o formulário de edição: só para o dono (ou admin) e enquanto ativa; null para os demais. */
export async function editableMission(editor: { id: string; isAdmin: boolean }, missionId: string): Promise<{ mission: MissionRecord; values: MissionFormValues } | null> {
  if (!UUID.test(missionId)) return null;
  const mission = await missionRepository().findById(missionId);
  if (!mission || (mission.ownerId !== editor.id && !editor.isAdmin) || mission.status !== "active") return null;
  return {
    mission,
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
