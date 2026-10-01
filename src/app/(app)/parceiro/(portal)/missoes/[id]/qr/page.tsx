import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole } from "@/modules/identity";
import { PrintButton, QR_ROTATION_SECONDS, QrAutoRefresh, StepQrGrid, missionQrCodes } from "@/modules/missions";
import { requirePartner } from "@/modules/partners";
import { ButtonLink } from "@/shared/ui";

export const metadata: Metadata = { title: "QR codes · Portal do parceiro", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function QrCodesPage({ params, searchParams }: PageProps<"/parceiro/missoes/[id]/qr">) {
  const { user } = await requirePartner("/parceiro/missoes");
  const { id } = await params;
  const { impressao } = await searchParams;
  const print = impressao === "1";
  const codes = await missionQrCodes({ id: user.id, isAdmin: hasRole(user, "admin") }, id, print ? "print" : "screen");
  if (!codes) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/parceiro/missoes" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg print:hidden">
        <ArrowLeft aria-hidden className="size-4" /> Missões
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">QR codes · {codes.title}</h1>
        <p className="text-muted print:hidden">
          {print
            ? "Versão para imprimir: estes QR codes valem só até o fim de hoje. Imprima um novo a cada dia."
            : "Deixe esta tela aberta no balcão. Os QR codes mudam sozinhos a cada minuto, então uma foto do QR não serve para depois."}
        </p>
      </header>
      <div className="flex flex-wrap gap-2 print:hidden">
        {print ? (
          <>
            <PrintButton />
            <ButtonLink href={`/parceiro/missoes/${codes.missionId}/qr`} variant="secondary">
              Voltar ao QR da tela
            </ButtonLink>
          </>
        ) : (
          <ButtonLink href={`/parceiro/missoes/${codes.missionId}/qr?impressao=1`} variant="secondary">
            Versão para imprimir (vale hoje)
          </ButtonLink>
        )}
      </div>
      {!print && <QrAutoRefresh seconds={QR_ROTATION_SECONDS} />}
      <StepQrGrid codes={codes} />
    </div>
  );
}
