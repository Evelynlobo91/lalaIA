import { candidateKey, type Candidate } from "./candidate";
import type { SearchConstraints } from "./constraints";
import type { ScoreWeights, SignalId } from "./score-weights";
import type { TasteProfile } from "./taste-profile";

export type ScoreContext = {
  constraints: SearchConstraints;
  profile: TasteProfile;
  /** Chaves `kind:id` com live ativa agora. */
  liveKeys: ReadonlySet<string>;
  /** Chaves `kind:id` com destaque patrocinado valendo agora (#29). */
  sponsoredKeys?: ReadonlySet<string>;
};

/** Resultado de um sinal: força de 0 a 1 e o porquê, em português, para a pessoa. */
export type SignalHit = { strength: number; reason: string };

/**
 * Sinal de score (estratégia, OCP): cada um olha uma coisa só. Um sinal novo é uma nova classe na lista
 * da composição + um peso em `DEFAULT_WEIGHTS`, sem mudar o `Ranker`.
 */
export interface ScoreSignal {
  readonly id: SignalId;
  evaluate(candidate: Candidate, context: ScoreContext): SignalHit | null;
}

export type Reason = { signal: SignalId; text: string; points: number };

export type Recommendation = { candidate: Candidate; score: number; reasons: Reason[] };

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const startOf = (c: Candidate) => (c.availability.known && c.availability.window ? c.availability.window.start.getTime() : Number.POSITIVE_INFINITY);

/**
 * Ranking determinístico e explicável: score = Σ peso × força; motivos do que mais pesou para o que menos.
 * Empates: mais perto, depois o que começa antes, depois o título e a chave (ordem estável).
 */
export class Ranker {
  constructor(
    private readonly signals: readonly ScoreSignal[],
    private readonly weights: ScoreWeights,
  ) {}

  rank(candidates: Candidate[], context: ScoreContext): Recommendation[] {
    return candidates
      .map((candidate) => {
        const reasons: Reason[] = [];
        for (const signal of this.signals) {
          const hit = signal.evaluate(candidate, context);
          const points = hit ? round2(this.weights[signal.id] * clamp01(hit.strength)) : 0;
          if (hit && points > 0) reasons.push({ signal: signal.id, text: hit.reason, points });
        }
        reasons.sort((a, b) => b.points - a.points);
        return { candidate, score: round2(reasons.reduce((sum, r) => sum + r.points, 0)), reasons };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          (a.candidate.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.candidate.distanceMeters ?? Number.POSITIVE_INFINITY) ||
          startOf(a.candidate) - startOf(b.candidate) ||
          a.candidate.title.localeCompare(b.candidate.title, "pt-BR") ||
          candidateKey(a.candidate).localeCompare(candidateKey(b.candidate)),
      );
  }
}
