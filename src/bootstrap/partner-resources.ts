import type { PartnerResource, PartnerResources } from "@/modules/analytics";
import { eventsByOwner } from "@/modules/events";
import { liveStreamsOf } from "@/modules/live";
import { missionsByOwner } from "@/modules/missions";
import { placesManagedBy } from "@/modules/places";

/**
 * Recursos do parceiro para o painel de dados (#78), montados a partir das APIs públicas dos módulos donos.
 * Fica no bootstrap (composição da aplicação) para o analytics não depender de live, que já depende dele.
 * O isolamento entre parceiros vem daqui: só entra o que o próprio usuário gerencia ou criou.
 */
export const partnerResources: PartnerResources = {
  async resourcesOf(userId: string): Promise<PartnerResource[]> {
    const [places, events, missions, streams] = await Promise.all([placesManagedBy(userId), eventsByOwner(userId), missionsByOwner(userId), liveStreamsOf(userId)]);
    const streamsOf = (type: "place" | "event", id: string) => streams.filter((s) => s.entityType === type && s.entityId === id).map((s) => s.streamId);
    return [
      ...places.map((p) => ({ type: "place" as const, id: p.id, name: p.name, liveStreamIds: streamsOf("place", p.id) })),
      ...events.map((e) => ({ type: "event" as const, id: e.id, name: e.title, liveStreamIds: streamsOf("event", e.id) })),
      ...missions.map((m) => ({ type: "mission" as const, id: m.id, name: m.title, liveStreamIds: [] })),
    ];
  },
};
