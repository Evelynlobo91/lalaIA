import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaForm, ctaFormValues, liveCtaPanel } from "@/modules/live";
import { requirePartner } from "@/modules/partners";
import { Card } from "@/shared/ui";

export const metadata: Metadata = { title: "Editar chamada · Portal do parceiro" };
export const dynamic = "force-dynamic";

export default async function EditarChamadaPage({ params }: PageProps<"/parceiro/live/chamadas/[streamId]/[ctaId]">) {
  const { streamId, ctaId } = await params;
  const { user } = await requirePartner(`/parceiro/live/chamadas/${streamId}/${ctaId}`);
  const panel = await liveCtaPanel(user, streamId);
  const cta = panel?.ctas.find((c) => c.id === ctaId);
  if (!panel || !cta || panel.stream.status === "ended") notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/parceiro/live/chamadas/${streamId}`} className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-brand">
        <ArrowLeft aria-hidden className="size-4" /> Chamadas na live
      </Link>
      <h1 className="text-2xl font-bold">Editar chamada</h1>
      <Card>
        <CtaForm streamId={streamId} options={panel.options} initial={ctaFormValues(cta)} submitLabel="Salvar alterações" />
      </Card>
    </div>
  );
}
