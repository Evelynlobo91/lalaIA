import type { Candidate } from "./candidate";
import type { CandidateQuery } from "./constraints";

/**
 * Fonte de candidatos (OCP/DIP): lugares, eventos e missões hoje; Live depois. Cada fonte usa só a
 * API pública do módulo dono dos dados, sem join entre schemas.
 */
export interface CandidateSource {
  /** Nome para logs (ex.: "places"). */
  readonly name: string;
  find(query: CandidateQuery): Promise<Candidate[]>;
}
