import { Sparkles } from "lucide-react";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Card, CardDescription, CardTitle } from "@/shared/ui";
import type { XpOverview } from "../xp-ledger.use-case";

const xpFormat = new Intl.NumberFormat("pt-BR");

/** Seção do perfil: saldo de XP (soma do livro) e as últimas transações. */
export function XpCard({ overview }: { overview: XpOverview }) {
  return (
    <Card className="flex flex-col gap-3" aria-labelledby="xp-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="xp-titulo" className="flex items-center gap-2">
          <Sparkles aria-hidden className="size-5 text-brand" /> Seu XP
        </CardTitle>
        <p className="text-2xl font-bold">
          {xpFormat.format(overview.balance)} XP
        </p>
      </div>
      {overview.history.length === 0 ? (
        <CardDescription>Conclua etapas de missões para ganhar XP.</CardDescription>
      ) : (
        <>
          <h4 className="text-sm font-semibold text-muted">Histórico</h4>
          <ul className="flex flex-col divide-y divide-border" aria-label="Histórico de XP">
            {overview.history.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.description}</p>
                  <p className="text-sm text-muted">{formatDateTime(t.createdAt)}</p>
                </div>
                <span className="shrink-0 font-semibold text-brand">+{t.amount} XP</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
