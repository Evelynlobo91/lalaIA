import { Clock, Sparkles } from "lucide-react";
import Link from "next/link";
import { formatTime } from "@/shared/time/joinville-time";
import { Badge, Card } from "@/shared/ui";
import type { SurpriseTeaser } from "../surprise-missions.use-case";
import { SurpriseOfferButtons } from "./surprise-offer-buttons";

const distanceLabel = (m: number) => (m < 1000 ? `a ~${m} m de você` : `a ~${(m / 1000).toFixed(1).replace(".", ",")} km de você`);

/** Missão surpresa oferecida: o essencial e quantas etapas, sem revelar quais. Validade curta. */
export function SurpriseOfferCard({ offer }: { offer: SurpriseTeaser }) {
  return (
    <Card className="flex flex-col gap-3 border-accent">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-lg font-semibold leading-tight">
          <Sparkles aria-hidden className="size-5 shrink-0 text-brand" />
          <Link href={`/missoes/${offer.missionId}`} className="hover:underline">
            {offer.title}
          </Link>
        </h3>
        <Badge variant="brand">{offer.xp} XP</Badge>
      </div>
      <p className="line-clamp-3 text-sm">{offer.description}</p>
      <p className="text-sm text-muted">
        {offer.stepCount} {offer.stepCount === 1 ? "etapa surpresa" : "etapas surpresa"}, reveladas uma por vez depois do aceite
        {offer.distanceMeters !== null ? `, começando ${distanceLabel(offer.distanceMeters)}` : ""}.
      </p>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Clock aria-hidden className="size-4 shrink-0" /> Aceite até {formatTime(offer.expiresAt)}
      </p>
      <SurpriseOfferButtons missionId={offer.missionId} title={offer.title} />
    </Card>
  );
}
