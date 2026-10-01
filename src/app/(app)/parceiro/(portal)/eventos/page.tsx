import { CalendarDays, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CancelEventButton, eventsByOwner, formatPrice, type OwnerEventItem } from "@/modules/events";
import { requirePartner } from "@/modules/partners";
import { Badge, ButtonLink, Card, EmptyState, FormAlert } from "@/shared/ui";
import { formatDateTime } from "@/shared/time/joinville-time";

export const metadata: Metadata = { title: "Eventos · Portal do parceiro" };
export const dynamic = "force-dynamic";

export default async function EventosPortalPage({ searchParams }: PageProps<"/parceiro/eventos">) {
  const { user } = await requirePartner("/parceiro/eventos");
  const { salvo } = await searchParams;
  const all = await eventsByOwner(user.id);
  const now = new Date();

  const upcoming = all.filter((e) => e.status === "scheduled" && e.endsAt >= now).sort((a, b) => +a.startsAt - +b.startsAt);
  const past = all.filter((e) => e.status === "scheduled" && e.endsAt < now);
  const cancelled = all.filter((e) => e.status === "cancelled");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Eventos</h1>
        <ButtonLink href="/parceiro/eventos/novo">
          <Plus aria-hidden className="size-5" /> Novo evento
        </ButtonLink>
      </div>
      {salvo && <FormAlert variant="success">Evento salvo.</FormAlert>}

      {all.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nenhum evento ainda" description="Publique o que vai acontecer: shows, festas, feiras, exposições, oficinas…" />
      ) : (
        <>
          <EventGroup title="Próximos" items={upcoming} editable />
          <EventGroup title="Já aconteceram" items={past} />
          <EventGroup title="Cancelados" items={cancelled} />
        </>
      )}
    </div>
  );
}

function EventGroup({ title, items, editable = false }: { title: string; items: OwnerEventItem[]; editable?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="flex flex-col gap-3">
        {items.map((e) => (
          <li key={e.id}>
            <Card className="flex flex-col gap-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold">{e.title}</h3>
                {e.status === "cancelled" ? <Badge variant="danger">Cancelado</Badge> : <Badge>{formatPrice(e.priceCents)}</Badge>}
              </div>
              <p className="text-sm text-muted">
                {formatDateTime(e.startsAt)} · {e.placeName}
              </p>
              {editable && (
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/parceiro/eventos/${e.id}/editar`} className="text-sm font-medium text-brand underline" aria-label={`Editar ${e.title}`}>
                    Editar
                  </Link>
                  <CancelEventButton eventId={e.id} title={e.title} />
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
