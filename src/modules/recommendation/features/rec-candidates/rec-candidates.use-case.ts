import type { Logger } from "@/shared/observability";
import { candidateKey, type Candidate } from "../../domain/candidate";
import type { CandidateSource } from "../../domain/candidate-source";
import { queryFor, type SearchConstraints } from "../../domain/constraints";
import { applyFilters, defaultFilters, type CandidateFilter } from "../../domain/filters";

/**
 * RF39/RF43 — Camada 1 do motor: junta os candidatos de todas as fontes e aplica os filtros duros
 * (tempo, orçamento, distância, tipo). Uma fonte que falha é logada e ignorada: as outras continuam.
 */
export class FindCandidates {
  constructor(
    private readonly sources: readonly CandidateSource[],
    private readonly log: Pick<Logger, "error">,
    private readonly filters: readonly CandidateFilter[] = defaultFilters,
  ) {}

  async execute(constraints: SearchConstraints): Promise<Candidate[]> {
    const query = queryFor(constraints);
    const results = await Promise.allSettled(this.sources.map((s) => s.find(query)));
    const seen = new Set<string>();
    const all: Candidate[] = [];
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        // Só o nome da fonte e o erro: a localização nunca vai para o log.
        this.log.error("fonte de candidatos falhou", { source: this.sources[i]!.name, error: String(result.reason) });
        return;
      }
      for (const c of result.value) {
        const key = candidateKey(c);
        if (!seen.has(key)) {
          seen.add(key);
          all.push(c);
        }
      }
    });
    return applyFilters(all, this.filters, constraints);
  }
}
