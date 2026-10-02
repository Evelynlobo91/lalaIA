import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SimulatePaymentForm, paymentSimulatorEnabled } from "@/modules/billing";
import { requireUser } from "@/modules/identity";
import { ButtonLink, Card, CardDescription, CardTitle } from "@/shared/ui";

export const metadata: Metadata = { title: "Pagamento simulado", robots: { index: false } };

// Destino do link de pagamento do provedor simulado (desenvolvimento, E2E e previews). Não cobra ninguém.
export default async function PagamentoSimuladoPage({ params }: PageProps<"/pagamento/simulado/[id]">) {
  const { id } = await params;
  if (!/^fake_[0-9a-f]{24}$/.test(id)) notFound();
  await requireUser(`/pagamento/simulado/${id}`);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Pagamento simulado</h1>
      <Card className="flex flex-col gap-3">
        <CardTitle>Este ambiente não cobra de verdade</CardTitle>
        <CardDescription>
          O provedor de pagamento ainda não está configurado: este link existe para testar o fluxo. Com o provedor real, aqui abriria a tela de Pix, boleto ou cartão.
        </CardDescription>
        <p className="text-sm text-muted">Cobrança: {id}</p>
        {paymentSimulatorEnabled() && <SimulatePaymentForm gatewayInvoiceId={id} />}
        <ButtonLink href="/parceiro/assinatura" variant="secondary" className="self-start">
          Voltar para a assinatura
        </ButtonLink>
      </Card>
    </div>
  );
}
