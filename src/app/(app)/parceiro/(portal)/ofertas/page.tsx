import { Plus, TicketPercent } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EndOfferButton, ValidateCodeForm, myOffers, requirePartner, type OfferAvailability, type PartnerOfferItem } from "@/modules/partners";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, ButtonLink, Card, EmptyState, FormAlert, type BadgeVariant } from "@/shared/ui";

export const metadata: Metadata = { title: "Ofertas · Portal do parceiro" };
export const dynamic = "force-dynamic";

const STATUS: Record<OfferAvailability, { label: string; variant: BadgeVariant }> = {
  available: { label: "Valendo", variant: "success" },
  upcoming: { label: "Agendada", variant: "neutral" },
  sold_out: { label: "Esgotada", variant: "warning" },
  expired: { label: "Expirada", variant: "danger" },
  ended: { label: "Encerrada", variant: "danger" },
};

export default async function OfertasPortalPage({ searchParams }: PageProps<"/parceiro/ofertas">) {
  const session = await requirePartner("/parceiro/ofertas");
  const { salvo } = await searchParams;
  const offers = await myOffers(session);
  const current = offers.filter((o) => o.availability === "available" || o.availability === "upcoming" || o.availability === "sold_out");
  const finished = offers.filter((o) => !current.includes(o));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Ofertas</h1>
        <ButtonLink href="/parceiro/ofertas/nova">
          <Plus aria-hidden className="size-5" /> Nova oferta
        </ButtonLink>
      </div>
      {salvo && <FormAlert variant="success">Oferta salva.</FormAlert>}

      <ValidateCodeForm />

      {offers.length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title="Nenhuma oferta ainda"
          description="Crie descontos e promoções nos seus lugares e eventos. Quem resgatar recebe um código para mostrar no balcão."
        />
      ) : (
        <>
          <OfferGroup title="Valendo e agendadas" items={current} />
          <OfferGroup title="Encerradas" items={finished} />
        </>
      )}
    </div>
  );
}

function OfferGroup({ title, items }: { title: string; items: PartnerOfferItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="flex flex-col gap-3">
        {items.map((o) => (
          <li key={o.id}>
            <Card className="flex flex-col gap-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold">{o.title}</h3>
                <Badge variant={STATUS[o.availability].variant}>{STATUS[o.availability].label}</Badge>
              </div>
              <p className="text-sm text-muted">
                {o.target.type === "place" ? "Lugar" : "Evento"}: {o.targetName}
              </p>
              <p className="text-sm text-muted">
                De {formatDateTime(o.startsAt)} até {formatDateTime(o.endsAt)}
              </p>
              <p className="text-sm">
                {o.redeemedCount} {o.redeemedCount === 1 ? "resgate" : "resgates"}
                {o.maxRedemptions !== null && ` de ${o.maxRedemptions}`} · {o.validatedCount} {o.validatedCount === 1 ? "usado" : "usados"} no balcão
              </p>
              {o.status === "active" && o.availability !== "expired" && (
                <div className="flex flex-wrap items-center gap-3">
                  {o.editable && (
                    <Link href={`/parceiro/ofertas/${o.id}/editar`} className="text-sm font-medium text-brand underline" aria-label={`Editar ${o.title}`}>
                      Editar
                    </Link>
                  )}
                  <EndOfferButton offerId={o.id} title={o.title} />
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
