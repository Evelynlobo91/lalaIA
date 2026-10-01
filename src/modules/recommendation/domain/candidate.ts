import { categories, type CategoryId } from "@/shared/catalog/categories";

/** De onde veio a sugestão. Uma fonte nova (ex.: Live) é um novo `CandidateSource`, sem mudar o motor. */
export type CandidateKind = "place" | "event" | "mission";

export type Interval = { start: Date; end: Date };

/**
 * Quando dá para aproveitar o candidato.
 * - `known: true, window`: período em que está aberto/acontecendo (`null` = fechado no período pedido);
 * - `known: false`: horário não informado (ex.: lugar do OSM sem `opening_hours`).
 */
export type Availability = { known: true; window: Interval | null } | { known: false };

/** Algo que a pessoa pode fazer agora: lugar, evento ou missão. Só dados (serializável). */
export type Candidate = {
  kind: CandidateKind;
  id: string;
  title: string;
  /** Categoria do catálogo; missões não têm. */
  category: CategoryId | null;
  categoryLabel: string | null;
  placeName: string | null;
  neighborhood: string | null;
  /** Página de detalhe no app. */
  href: string;
  /** Preço por pessoa em centavos; `null` = sem preço informado. */
  priceCents: number | null;
  availability: Availability;
  /** Distância da origem (m); `null` sem localização. */
  distanceMeters: number | null;
  /** Desde quando é novidade (evento publicado, lugar de parceiro, missão lançada); `null` = não é. */
  newSince: Date | null;
  /** XP da missão. */
  xp: number | null;
};

export const candidateKey = (c: Pick<Candidate, "kind" | "id">) => `${c.kind}:${c.id}`;

const labels = new Map<string, string>(categories.map((c) => [c.id, c.label]));

export const categoryLabel = (id: CategoryId) => labels.get(id) ?? id;
