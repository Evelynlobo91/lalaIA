import Link from "next/link";
import { formatShortCode } from "@/shared/kernel/short-code";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, Card, CardDescription, CardTitle } from "@/shared/ui";
import type { MyRewardClaim } from "../../../domain/reward";

/** "Minhas recompensas" no perfil: os códigos das recompensas de missão resgatadas (#62). */
export function MyRewardsCard({ items }: { items: MyRewardClaim[] }) {
  return (
    <Card className="flex flex-col gap-3" aria-labelledby="minhas-recompensas">
      <CardTitle id="minhas-recompensas">Minhas recompensas</CardTitle>
      {items.length === 0 ? (
        <CardDescription>Conclua missões com recompensa para ganhar prêmios dos parceiros.</CardDescription>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{r.description}</span>
                <Badge variant={r.validatedAt ? "neutral" : "success"}>{r.validatedAt ? "Usado" : "Válido"}</Badge>
              </div>
              <span className="font-mono text-lg font-bold tracking-widest">{formatShortCode(r.code)}</span>
              <span className="text-sm text-muted">
                <Link href={`/missoes/${r.missionId}`} className="underline hover:text-fg">
                  {r.missionTitle}
                </Link>{" "}
                · {r.validatedAt ? `usado em ${formatDateTime(r.validatedAt)}` : `resgatado em ${formatDateTime(r.claimedAt)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
