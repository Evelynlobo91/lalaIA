import { Target } from "lucide-react";
import { EmptyState } from "@/shared/ui";
import type { RecommendationItem } from "../../rec-score/recommendation-item";
import { RecommendationList } from "../../rec-score/ui/recommendation-card";

/** Seção "Missões para você" (#64): ordenadas por relevância, cada uma com o porquê. */
export function MissionRecommendations({ items, summary }: { items: RecommendationItem[]; summary?: string }) {
  return (
    <section aria-labelledby="missoes-para-voce" className="flex flex-col gap-3">
      <h2 id="missoes-para-voce" className="text-lg font-semibold">
        Missões para você {summary && <span className="text-sm font-normal text-muted">({summary})</span>}
      </h2>
      {items.length === 0 ? (
        <EmptyState icon={Target} title="Nenhuma missão cabe nisso agora" description="Tente com mais tempo ou um orçamento maior. Novas missões aparecem quando os parceiros publicam." />
      ) : (
        <RecommendationList items={items} label="Missões ordenadas para você" />
      )}
    </section>
  );
}
