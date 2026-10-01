import { Gift } from "lucide-react";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, Card, CardTitle } from "@/shared/ui";
import type { MissionRewardView } from "../rewards.use-case";
import { ClaimRewardButton } from "./claim-reward-button";
import { RewardCode } from "./reward-code";

/** Recompensa do parceiro na tela da missão (#62): incentivo antes, botão de resgate depois de concluir. */
export function MissionRewardCard({ reward }: { reward: MissionRewardView }) {
  const { state, claim, remaining } = reward;
  return (
    <Card className="flex flex-col gap-3" aria-labelledby="recompensa-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h2" id="recompensa-titulo" className="flex items-center gap-2">
          <Gift aria-hidden className="size-5 text-brand" /> Recompensa
        </CardTitle>
        {state === "claimed" && claim?.validatedAt ? (
          <Badge variant="neutral">Usada</Badge>
        ) : state === "claimed" ? (
          <Badge variant="success">Resgatada</Badge>
        ) : state === "sold_out" || remaining === 0 ? (
          <Badge variant="warning">Esgotada</Badge>
        ) : remaining !== null ? (
          <Badge>
            {remaining} {remaining === 1 ? "restante" : "restantes"}
          </Badge>
        ) : null}
      </div>
      <p className="font-semibold">{reward.description}</p>

      {state === "locked" && <p className="text-sm text-muted">Conclua todas as etapas para resgatar a recompensa no balcão do parceiro.</p>}
      {state === "claimable" && <ClaimRewardButton missionId={reward.missionId} />}
      {state === "sold_out" && (
        <p role="status" className="text-sm">
          As recompensas desta missão esgotaram. Sua missão continua concluída, com o XP.
        </p>
      )}
      {state === "claimed" && claim && (
        <RewardCode
          code={claim.code}
          note={claim.validatedAt ? `Usado no balcão em ${formatDateTime(claim.validatedAt)}.` : "Mostre este código no balcão. Ele vale uma vez."}
        />
      )}
    </Card>
  );
}
