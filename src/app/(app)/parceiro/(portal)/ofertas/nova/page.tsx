import { ArrowLeft, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { OfferForm, offerTargetChoices, requirePartner } from "@/modules/partners";
import { ButtonLink, EmptyState } from "@/shared/ui";

export const metadata: Metadata = { title: "Nova oferta · Portal do parceiro" };

export default async function NovaOfertaPage() {
  const session = await requirePartner("/parceiro/ofertas/nova");
  const targetOptions = await offerTargetChoices(session);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/parceiro/ofertas" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Ofertas
      </Link>
      <h1 className="text-2xl font-bold">Nova oferta</h1>
      {targetOptions.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Você ainda não tem lugar nem evento"
          description="A oferta vale num lugar que você gerencia ou num evento que você criou. Reivindique o seu estabelecimento ou publique um evento primeiro."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/parceiro/lugares">Meus lugares</ButtonLink>
              <ButtonLink href="/parceiro/eventos" variant="secondary">
                Eventos
              </ButtonLink>
            </div>
          }
        />
      ) : (
        <OfferForm submitLabel="Publicar oferta" targetOptions={targetOptions} />
      )}
    </div>
  );
}
