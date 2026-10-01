import Link from "next/link";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, Card, CardDescription, CardTitle } from "@/shared/ui";
import { formatOfferCode } from "../../../domain/offer-code";
import type { MyRedemptionItem } from "../offer-views";

const STATUS = {
  valid: { label: "Válido", variant: "success" },
  validated: { label: "Usado", variant: "neutral" },
  expired: { label: "Expirado", variant: "danger" },
} as const;

/** "Meus resgates" no perfil: os códigos das ofertas resgatadas. */
export function MyRedemptionsCard({ items }: { items: MyRedemptionItem[] }) {
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Meus resgates</CardTitle>
      {items.length === 0 ? (
        <CardDescription>Você ainda não resgatou nenhuma oferta. Procure por “Ofertas” na página dos lugares e eventos.</CardDescription>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{r.offerTitle}</span>
                <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
              </div>
              <span className="font-mono text-lg font-bold tracking-widest">{formatOfferCode(r.code)}</span>
              <span className="text-sm text-muted">
                <Link href={r.target.href} className="underline hover:text-fg">
                  {r.target.name}
                </Link>{" "}
                ·{" "}
                {r.status === "validated" && r.validatedAt
                  ? `usado em ${formatDateTime(r.validatedAt)}`
                  : r.status === "expired"
                    ? `expirou em ${formatDateTime(r.endsAt)}`
                    : `válido até ${formatDateTime(r.endsAt)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
