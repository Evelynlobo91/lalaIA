import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OfferForm, editableOffer, offerTargetChoices, requirePartner } from "@/modules/partners";

export const metadata: Metadata = { title: "Editar oferta · Portal do parceiro" };

export default async function EditarOfertaPage({ params }: PageProps<"/parceiro/ofertas/[id]/editar">) {
  const session = await requirePartner("/parceiro/ofertas");
  const { id } = await params;
  // Oferta de outro parceiro, já resgatada ou encerrada → 404.
  const values = await editableOffer(session, id);
  if (!values) notFound();
  const targetOptions = await offerTargetChoices(session);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/parceiro/ofertas" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Ofertas
      </Link>
      <h1 className="text-2xl font-bold">Editar oferta</h1>
      <p className="text-sm text-muted">Dá para editar enquanto ninguém resgatou. Depois do primeiro resgate, a oferta só pode ser encerrada.</p>
      <OfferForm initial={values} targetOptions={targetOptions} submitLabel="Salvar alterações" />
    </div>
  );
}
