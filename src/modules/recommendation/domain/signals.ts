import { isHappeningAt, startsInLabel, startsSoon } from "@/modules/events";
import { formatDistance } from "@/modules/places";
import { candidateKey, categoryLabel, type Candidate } from "./candidate";
import { horizonOf } from "./constraints";
import type { ScoreContext, ScoreSignal, SignalHit } from "./score";

/** "Porque você curte Shows e música": categoria entre as preferidas do perfil. */
export class PreferenceSignal implements ScoreSignal {
  readonly id = "preference";

  evaluate(c: Candidate, { profile }: ScoreContext): SignalHit | null {
    if (!c.category || !profile.categories.includes(c.category)) return null;
    return { strength: 1, reason: `Porque você curte ${categoryLabel(c.category)}` };
  }
}

/**
 * O momento: evento acontecendo agora (1) > começando dentro do tempo disponível (0,6) > lugar aberto agora (0,3).
 * Usa as mesmas regras de "acontecendo agora" e "em breve" do módulo events.
 */
export class HappeningNowSignal implements ScoreSignal {
  readonly id = "happeningNow";

  evaluate(c: Candidate, { constraints }: ScoreContext): SignalHit | null {
    if (!c.availability.known || !c.availability.window) return null;
    const window = { startsAt: c.availability.window.start, endsAt: c.availability.window.end };
    const now = constraints.now;
    if (c.kind === "event") {
      if (isHappeningAt(window, now)) return { strength: 1, reason: "Acontecendo agora" };
      const soonWindow = horizonOf(constraints).getTime() - now.getTime();
      if (startsSoon(window, now, soonWindow)) return { strength: 0.6, reason: startsInLabel(window.startsAt, now) };
      return null;
    }
    if (c.kind === "place" && isHappeningAt(window, now)) return { strength: 0.3, reason: "Aberto agora" };
    return null;
  }
}

/** Transmissão ao vivo ativa (o módulo Live ainda não existe: hoje a porta devolve nenhuma). */
export class LiveSignal implements ScoreSignal {
  readonly id = "live";

  evaluate(c: Candidate, { liveKeys }: ScoreContext): SignalHit | null {
    return liveKeys.has(candidateKey(c)) ? { strength: 1, reason: "Com live agora" } : null;
  }
}

/** Dias em que algo continua sendo "novidade" (a força cai linearmente até zero). */
export const NOVELTY_DAYS = 14;

const noveltyReason: Record<Candidate["kind"], string> = {
  event: "Novidade na agenda",
  place: "Novo no LalaIA",
  mission: "Missão nova",
};

export class NoveltySignal implements ScoreSignal {
  readonly id = "novelty";

  evaluate(c: Candidate, { constraints }: ScoreContext): SignalHit | null {
    if (!c.newSince) return null;
    const ageDays = (constraints.now.getTime() - c.newSince.getTime()) / 86_400_000;
    if (ageDays < 0 || ageDays >= NOVELTY_DAYS) return null;
    return { strength: 1 - ageDays / NOVELTY_DAYS, reason: noveltyReason[c.kind] };
  }
}

export class FavoriteSignal implements ScoreSignal {
  readonly id = "favorite";

  evaluate(c: Candidate, { profile }: ScoreContext): SignalHit | null {
    return profile.favoriteKeys.has(candidateKey(c)) ? { strength: 1, reason: "Está nos seus favoritos" } : null;
  }
}

/** Mais perto pesa mais (só com localização): força 1 no ponto e 0 na distância máxima. */
export class ProximitySignal implements ScoreSignal {
  readonly id = "proximity";

  evaluate(c: Candidate, { constraints }: ScoreContext): SignalHit | null {
    if (!constraints.origin || c.distanceMeters === null || constraints.maxDistanceMeters <= 0) return null;
    const strength = 1 - c.distanceMeters / constraints.maxDistanceMeters;
    return strength > 0 ? { strength, reason: `A ${formatDistance(c.distanceMeters)} de você` } : null;
  }
}

export const defaultSignals: readonly ScoreSignal[] = [
  new PreferenceSignal(),
  new HappeningNowSignal(),
  new LiveSignal(),
  new NoveltySignal(),
  new FavoriteSignal(),
  new ProximitySignal(),
];
