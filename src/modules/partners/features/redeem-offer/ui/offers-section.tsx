import { TicketPercent } from "lucide-react";
import { getCurrentUser } from "@/modules/identity";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, ButtonLink, Card } from "@/shared/ui";
import { offersForTarget } from "../../../composition";
import type { OfferAvailability, OfferTarget } from "../../../domain/offer";
import { formatOfferCode } from "../../../domain/offer-code";
import type { OfferCard } from "../offer-views";
import { RedeemButton } from "./redeem-button";
import { RedemptionCode } from "./redemption-code";

const UNAVAILABLE_LABEL: Record<Exclude<OfferAvailability, "available">, string> = {
  upcoming: "Em breve",
  expired: "Encerrada",
  sold_out: "Esgotada",
  ended: "Encerrada",
};

/**
 * Ofertas do lugar/evento (slot `extras` dos cards de detalhe). Servidor: lê a sessão para saber se a
 * pessoa já resgatou. Sem ofertas, não renderiza nada.
 */
export async function OffersSection({ targetType, targetId, returnTo }: { targetType: OfferTarget["type"]; targetId: string; returnTo: string }) {
  const user = await getCurrentUser();
  const cards = await offersForTarget().execute({ type: targetType, id: targetId }, user?.id ?? null);
  if (cards.length === 0) return null;

  return (
    <section aria-labelledby={`ofertas-${targetId}`} className="flex flex-col gap-3">
      <h2 id={`ofertas-${targetId}`} className="flex items-center gap-2 text-lg font-semibold">
        <TicketPercent aria-hidden className="size-5 text-brand" /> Ofertas
      </h2>
      <ul className="flex flex-col gap-3">
        {cards.map((card) => (
          <li key={card.offer.id}>
            <OfferItem card={card} loggedIn={Boolean(user)} returnTo={returnTo} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function OfferItem({ card, loggedIn, returnTo }: { card: OfferCard; loggedIn: boolean; returnTo: string }) {
  const { offer, availability, remaining, myRedemption, own } = card;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{offer.title}</h3>
        {availability === "available" ? (
          <Badge variant="success">{remaining === null ? "Disponível" : `${remaining} ${remaining === 1 ? "restante" : "restantes"}`}</Badge>
        ) : (
          <Badge variant={availability === "upcoming" ? "neutral" : "danger"}>{UNAVAILABLE_LABEL[availability]}</Badge>
        )}
      </div>
      <p className="text-sm whitespace-pre-line">{offer.description}</p>
      <p className="text-sm text-muted">
        {availability === "upcoming" ? `Começa em ${formatDateTime(offer.startsAt)}` : `Válida até ${formatDateTime(offer.endsAt)}`} · 1 resgate por pessoa
      </p>
      {myRedemption ? (
        <RedemptionCode
          code={formatOfferCode(myRedemption.code)}
          note={myRedemption.validatedAt ? `Usado em ${formatDateTime(myRedemption.validatedAt)}.` : "Você já resgatou: mostre este código no balcão."}
        />
      ) : own ? (
        <p className="text-sm text-muted">Esta oferta é sua. Valide os códigos no portal do parceiro.</p>
      ) : availability !== "available" ? (
        <p className="text-sm text-muted">Indisponível no momento.</p>
      ) : loggedIn ? (
        <RedeemButton offerId={offer.id} title={offer.title} />
      ) : (
        <ButtonLink href={`/entrar?next=${encodeURIComponent(returnTo)}`} variant="secondary" className="self-start">
          Entre para resgatar
        </ButtonLink>
      )}
    </Card>
  );
}
