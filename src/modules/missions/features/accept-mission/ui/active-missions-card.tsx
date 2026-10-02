import { Target } from "lucide-react";
import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/shared/ui";
import type { MyMission } from "../mission-catalog";

/** Seção do perfil: missões em andamento. */
export function ActiveMissionsCard({ missions }: { missions: MyMission[] }) {
  const active = missions.filter((m) => m.userMission.status === "active");
  return (
    <Card className="flex flex-col gap-3" aria-labelledby="missoes-ativas">
      <CardTitle id="missoes-ativas" className="flex items-center gap-2">
        <Target aria-hidden className="size-5 text-brand" /> Missões ativas
      </CardTitle>
      {active.length === 0 ? (
        <CardDescription>
          Nenhuma missão em andamento.{" "}
          <Link href="/missoes" className="font-medium text-brand underline">
            Escolha uma missão
          </Link>
          .
        </CardDescription>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {active.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <Link href={`/missoes/${m.id}`} className="min-w-0 truncate font-medium hover:underline">
                {m.title}
              </Link>
              <span className="shrink-0 text-sm text-muted">{m.progress.percent}% concluída</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
