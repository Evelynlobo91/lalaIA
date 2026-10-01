import { eventsByOwner } from "@/modules/events";
import { myFavorites } from "@/modules/favorites";
import type { PersonalDataSource } from "@/modules/identity";
import { livePrivacyAcceptedAt, liveStreamsOf } from "@/modules/live";
import { missionsByOwner, myGeofenceCheckIns, myMissions, myRewards } from "@/modules/missions";
import { myPartnerApplication, myRedemptions, offersCreatedBy } from "@/modules/partners";
import { placesManagedBy } from "@/modules/places";
import { achievementsOf, explorerProfileOf, levelOverviewOf, xpOverviewOf } from "@/modules/progression";

/**
 * Fontes da exportação de dados pessoais (LGPD, #25): uma por módulo, pelas APIs públicas. Fica no
 * bootstrap (composição da aplicação) para o identity não depender dos outros módulos.
 * Módulo novo que guarde dados de alguém → uma linha aqui. Nunca exporta segredos (ex.: chave da Live).
 */
export const personalDataSources: PersonalDataSource[] = [
  { name: "favoritos", export: (user) => myFavorites(user) },
  { name: "missoes", export: (user) => myMissions(user.id) },
  { name: "checkinsPorGps", export: (user) => myGeofenceCheckIns(user.id) },
  { name: "recompensasDeMissoes", export: (user) => myRewards(user.id) },
  { name: "xp", export: (user) => xpOverviewOf(user.id, 10_000) },
  { name: "nivel", export: (user) => levelOverviewOf(user.id) },
  { name: "conquistas", export: (user) => achievementsOf(user.id) },
  { name: "perfilDeExplorador", export: (user) => explorerProfileOf(user.id) },
  { name: "parceiro", export: async (user) => (await myPartnerApplication(user)) ?? null },
  { name: "lugaresQueGerencio", export: (user) => placesManagedBy(user.id) },
  { name: "eventosQueCriei", export: (user) => eventsByOwner(user.id) },
  { name: "missoesQueCriei", export: (user) => missionsByOwner(user.id) },
  { name: "ofertasResgatadas", export: (user) => myRedemptions(user.id) },
  { name: "ofertasQueCriei", export: (user) => offersCreatedBy(user.id) },
  {
    name: "transmissoes",
    export: async (user) => ({ transmissoes: await liveStreamsOf(user.id), diretrizesDePrivacidadeAceitasEm: await livePrivacyAcceptedAt(user) }),
  },
];
