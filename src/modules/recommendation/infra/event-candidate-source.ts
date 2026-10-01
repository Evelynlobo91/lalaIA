import type { EventCandidate, EventCandidatesQuery } from "@/modules/events";
import { categoryLabel, type Candidate } from "../domain/candidate";
import type { CandidateSource } from "../domain/candidate-source";
import type { CandidateQuery, Point } from "../domain/constraints";

/** O que a fonte usa das APIs públicas de events e places. */
export type EventsForRecommendation = {
  candidates(query: EventCandidatesQuery): Promise<EventCandidate[]>;
  distances(origin: Point, placeIds: string[]): Promise<Map<string, number>>;
};

export const EVENT_CANDIDATE_LIMIT = 60;

/** Eventos acontecendo agora ou começando dentro do tempo disponível. */
export class EventCandidateSource implements CandidateSource {
  readonly name = "events";

  constructor(private readonly events: EventsForRecommendation) {}

  async find(q: CandidateQuery): Promise<Candidate[]> {
    const rows = await this.events.candidates({ from: q.now, to: q.horizon, limit: EVENT_CANDIDATE_LIMIT });
    const inCategory = q.categories ? rows.filter((e) => q.categories!.includes(e.category)) : rows;
    const distances = q.origin && inCategory.length ? await this.events.distances(q.origin, [...new Set(inCategory.map((e) => e.placeId))]) : new Map<string, number>();
    return inCategory.map((e) => {
      const meters = distances.get(e.placeId);
      return {
        kind: "event",
        id: e.id,
        title: e.title,
        category: e.category,
        categoryLabel: categoryLabel(e.category),
        placeName: e.placeName,
        neighborhood: e.neighborhood,
        href: `/eventos/${e.id}`,
        priceCents: e.priceCents,
        availability: { known: true, window: { start: e.startsAt, end: e.endsAt } },
        distanceMeters: meters === undefined ? null : Math.round(meters),
        newSince: e.publishedAt,
        xp: null,
      };
    });
  }
}
