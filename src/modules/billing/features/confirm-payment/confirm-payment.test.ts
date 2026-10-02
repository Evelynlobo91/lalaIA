import { describe, expect, it, vi } from "vitest";
import type { AppliedEvent } from "../../domain/payment";
import { ConfirmPaymentManually, confirmPaymentSchema, type InvoiceToConfirm } from "./confirm-payment.use-case";

const INVOICE = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const now = new Date("2026-10-03T15:00:00Z");
const finance = { id: "fin", canRead: true, canWrite: true };
const invoice = (patch: Partial<InvoiceToConfirm> = {}): InvoiceToConfirm => ({ id: INVOICE, ownerId: "dona", gateway: "fake", gatewayInvoiceId: "fake_1", status: "pending", ...patch });

const deps = (found: InvoiceToConfirm | null = invoice(), applied: AppliedEvent = { outcome: "applied", change: { subscriptionId: "s1", ownerId: "dona", from: "pending", to: "active" } }) => {
  const find = vi.fn().mockResolvedValue(found);
  const apply = vi.fn().mockResolvedValue(applied);
  const events = { publish: vi.fn().mockResolvedValue(undefined) };
  return { find, apply, events, useCase: new ConfirmPaymentManually({ find }, { apply }, events, () => now) };
};

describe("ConfirmPaymentManually", () => {
  it("confirma pelo mesmo caminho do webhook de 'pago', de forma idempotente, e registra quem confirmou", async () => {
    const { find, apply, events, useCase } = deps();
    expect(await useCase.execute(finance, INVOICE)).toEqual({ ok: true, value: { invoiceId: INVOICE } });
    expect(find).toHaveBeenCalledWith("fin", INVOICE);
    expect(apply).toHaveBeenCalledWith("fake", { eventId: `manual:${INVOICE}`, kind: "paid", gatewayInvoiceId: "fake_1", occurredAt: now });
    expect(events.publish).toHaveBeenCalledTimes(1);
    expect(events.publish).toHaveBeenCalledWith("billing.PaymentConfirmedManually", { invoiceId: INVOICE, ownerId: "dona", confirmedBy: "fin" });
  });

  it("fatura vencida também pode ser confirmada; se a assinatura estava suspensa, avisa a reativação", async () => {
    const { events, useCase } = deps(invoice({ status: "overdue" }), { outcome: "applied", change: { subscriptionId: "s1", ownerId: "dona", from: "suspended", to: "active" } });
    expect((await useCase.execute(finance, INVOICE)).ok).toBe(true);
    expect(events.publish).toHaveBeenCalledWith("billing.SubscriptionReactivated", { subscriptionId: "s1", ownerId: "dona" });
  });

  it("só quem tem billing:write confirma (quem só lê não chega nem a consultar)", async () => {
    const { find, apply, useCase } = deps();
    const result = await useCase.execute({ id: "leitor", canRead: true, canWrite: false }, INVOICE);
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("fatura inexistente, já paga, estornada ou cancelada não é confirmada", async () => {
    const missing = deps(null);
    const r1 = await missing.useCase.execute(finance, INVOICE);
    expect(!r1.ok && r1.error.code).toBe("not_found");
    for (const status of ["paid", "refunded", "cancelled"] as const) {
      const d = deps(invoice({ status }));
      const r = await d.useCase.execute(finance, INVOICE);
      expect(!r.ok && r.error.code).toBe("invoice_not_open");
      expect(d.apply).not.toHaveBeenCalled();
    }
  });

  it("se alguém confirmou no meio do caminho (evento repetido ou sem efeito), não publica nada", async () => {
    for (const outcome of ["duplicate", "ignored"] as const) {
      const d = deps(invoice(), { outcome, change: null });
      const r = await d.useCase.execute(finance, INVOICE);
      expect(!r.ok && r.error.code).toBe("invoice_not_open");
      expect(d.events.publish).not.toHaveBeenCalled();
    }
  });

  it("schema: só o id da fatura", () => {
    expect(confirmPaymentSchema.safeParse({ invoiceId: INVOICE }).success).toBe(true);
    expect(confirmPaymentSchema.safeParse({ invoiceId: "1" }).success).toBe(false);
  });
});
