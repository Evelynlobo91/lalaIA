import { BusinessRuleError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { MissionRecord, MissionRepository } from "../../domain/mission";
import { SURPRISE_RADIUS_METERS, isOpen, offerExpiry, worthOffering, type SurpriseOffer, type SurpriseOfferRepository } from "../../domain/surprise";
import { MAX_ACTIVE_MISSIONS, type UserMission, type UserMissionRepository } from "../../domain/user-mission";
import { acceptanceProblem } from "../accept-mission/accept-mission.use-case";

export type Point = { lat: number; lon: number };

/** O que aparece antes do aceite: nada das etapas além de quantas são. */
export type SurpriseTeaser = {
  missionId: string;
  title: string;
  description: string;
  xp: number;
  stepCount: number;
  expiresAt: Date;
  /** Distância até a primeira etapa (arredondada para 50 m); null nas ofertas listadas sem localização. */
  distanceMeters: number | null;
};

/** Distância de um ponto até vários lugares (PostGIS, API pública de places). */
export type PlaceDistances = (origin: Point, placeIds: string[]) => Promise<Map<string, number>>;

const firstStep = (m: MissionRecord) => [...m.steps].sort((a, b) => a.position - b.position)[0];

const teaser = (m: MissionRecord, offer: Pick<SurpriseOffer, "expiresAt">, distanceMeters: number | null): SurpriseTeaser => ({
  missionId: m.id,
  title: m.title,
  description: m.description,
  xp: m.xp,
  stepCount: m.steps.length,
  expiresAt: offer.expiresAt,
  distanceMeters: distanceMeters === null ? null : Math.round(distanceMeters / 50) * 50,
});

/**
 * RF35 (#63) — Missão surpresa perto de quem está procurando. Gatilho por proximidade (primeira etapa a até
 * 1 km) e por horário (missão no prazo, com pelo menos 1 h pela frente). A oferta vale 30 min e é única por
 * pessoa e missão: ignorada ou expirada, não volta. A localização vive só nesta chamada.
 */
export class OfferSurpriseMission {
  constructor(
    private readonly missions: Pick<MissionRepository, "listAvailableSurprises" | "findByIds">,
    private readonly offers: SurpriseOfferRepository,
    private readonly userMissions: Pick<UserMissionRepository, "listByUser" | "countActive">,
    private readonly distances: PlaceDistances,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Ofertas em aberto (para a tela, sem localização). Leitura: não cria oferta. */
  async listOpen(userId: string): Promise<SurpriseTeaser[]> {
    const open = await this.offers.listOpen(userId, this.now());
    const byId = new Map((await this.missions.findByIds(open.map((o) => o.missionId))).map((m) => [m.id, m]));
    return open.flatMap((o) => {
      const m = byId.get(o.missionId);
      return m ? [teaser(m, o, null)] : [];
    });
  }

  /** Procura (e oferece) uma missão surpresa perto de `origin`. Se já há uma oferta aberta, devolve ela. */
  async findNear(userId: string, origin: Point): Promise<Result<SurpriseTeaser | null, DomainError>> {
    const now = this.now();
    const [current] = await this.listOpen(userId);
    if (current) return ok(current);
    if ((await this.userMissions.countActive(userId)) >= MAX_ACTIVE_MISSIONS) {
      return err(new BusinessRuleError("too_many_active_missions", `Você já tem ${MAX_ACTIVE_MISSIONS} missões em andamento. Conclua uma para receber surpresas.`));
    }

    const [offered, accepted] = await Promise.all([this.offers.offeredMissionIds(userId), this.userMissions.listByUser(userId)]);
    const taken = new Set([...offered, ...accepted.map((a) => a.missionId)]);
    const eligible = (await this.missions.listAvailableSurprises(now, 50)).filter((m) => m.ownerId !== userId && !taken.has(m.id) && m.steps.length > 0 && worthOffering(m.endsAt, now));
    if (eligible.length === 0) return ok(null);

    const distances = await this.distances(origin, [...new Set(eligible.map((m) => firstStep(m).placeId))]);
    const nearest = eligible
      .map((m) => ({ m, distance: distances.get(firstStep(m).placeId) }))
      .filter((c): c is { m: MissionRecord; distance: number } => c.distance !== undefined && c.distance <= SURPRISE_RADIUS_METERS)
      .sort((a, b) => a.distance - b.distance || a.m.endsAt.getTime() - b.m.endsAt.getTime() || a.m.id.localeCompare(b.m.id))[0];
    if (!nearest) return ok(null);

    const offer = await this.offers.create(userId, nearest.m.id, offerExpiry(now, nearest.m.endsAt));
    return ok(teaser(nearest.m, offer, nearest.distance));
  }
}

export type SurpriseDecision = "accept" | "dismiss";

export type SurpriseResponse = { decision: "accept"; missionId: string; userMission: UserMission } | { decision: "dismiss"; missionId: string };

/** RF35 (#63) — Aceitar ou ignorar a missão surpresa oferecida. Aceitar só antes de expirar. */
export class RespondSurpriseOffer {
  constructor(
    private readonly missions: Pick<MissionRepository, "findById">,
    private readonly offers: Pick<SurpriseOfferRepository, "find" | "accept" | "dismiss">,
    private readonly userMissions: Pick<UserMissionRepository, "countActive">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string, missionId: string, decision: SurpriseDecision): Promise<Result<SurpriseResponse, DomainError>> {
    const offer = await this.offers.find(userId, missionId);
    if (!offer) return err(new NotFoundError("Missão surpresa"));
    if (offer.status !== "offered") return err(new BusinessRuleError("surprise_answered", "Você já respondeu a esta missão surpresa.", { missionId }));

    if (decision === "dismiss") {
      await this.offers.dismiss(userId, missionId);
      return ok({ decision, missionId });
    }

    const now = this.now();
    if (!isOpen(offer, now)) return err(new BusinessRuleError("surprise_expired", "Esta missão surpresa expirou. Fique de olho: outras podem aparecer por perto."));
    const mission = await this.missions.findById(missionId);
    if (!mission) return err(new NotFoundError("Missão surpresa"));
    const problem = await acceptanceProblem(mission, userId, this.userMissions, now);
    if (problem) return err(problem);

    return ok({ decision, missionId, userMission: await this.offers.accept(userId, missionId) });
  }
}
