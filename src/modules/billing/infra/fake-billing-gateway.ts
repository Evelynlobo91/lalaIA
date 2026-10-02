import { createHash } from "node:crypto";
import type { BillingGateway } from "../domain/subscription";

/**
 * Provedor de pagamento simulado, para desenvolvimento, E2E e previews (o provedor real ainda não foi
 * escolhido: Asaas, Mercado Pago ou Stripe). Não cobra ninguém: o link leva a uma página do próprio app
 * que explica que a cobrança é simulada.
 */
export class FakeBillingGateway implements BillingGateway {
  readonly name = "fake";

  async createCharge(charge: { reference: string }): Promise<{ gatewayInvoiceId: string; paymentUrl: string }> {
    // Determinístico pela referência: repetir a chamada devolve a mesma cobrança (como um provedor idempotente).
    const gatewayInvoiceId = `fake_${createHash("sha256").update(charge.reference).digest("hex").slice(0, 24)}`;
    return { gatewayInvoiceId, paymentUrl: `/pagamento/simulado/${gatewayInvoiceId}` };
  }
}
