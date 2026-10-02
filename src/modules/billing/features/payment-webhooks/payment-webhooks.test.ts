import { describe, expect, it, vi } from "vitest";
import { UnauthorizedError, err, ok } from "@/shared/kernel";
import type { AppliedEvent, PaymentEvent, SubscriptionChange } from "../../domain/payment";
import { BILLING_SIGNATURE_HEADER, FakePaymentWebhooks, signBillingWebhook } from "../../infra/fake-payment-webhooks";
import { EnforceOverdue, HandlePaymentWebhook } from "./payment-webhooks.use-cases";

const secret = "s".repeat(40);
const now = new Date("2026-10-02T15:00:00Z");
const event = (patch: Partial<PaymentEvent> = {}): PaymentEvent => ({ eventId: "evt_1", kind: "paid", gatewayInvoiceId: "fake_abc", occurredAt: now, ...patch });
const change = (from: SubscriptionChange["from"], to: SubscriptionChange["to"]): SubscriptionChange => ({ subscriptionId: "s1", ownerId: "dono", from, to });
const bus = () => ({ publish: vi.fn().mockResolvedValue(undefined) });

describe("FakePaymentWebhooks (assinatura do provedor simulado)", () => {
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid", invoiceId: "fake_abc", occurredAt: now.toISOString() });
  const headers = (signature: string | null) => new Headers(signature ? { [BILLING_SIGNATURE_HEADER]: signature } : {});
  const webhooks = new FakePaymentWebhooks(secret, () => now);

  it("assinatura válida devolve o evento normalizado", () => {
    expect(webhooks.parse(body, headers(signBillingWebhook(secret, body, now)))).toEqual({ ok: true, value: [event()] });
  });

  it("recusa sem assinatura, com outro segredo, com o corpo alterado e fora da janela de 5 minutos", () => {
    const valid = signBillingWebhook(secret, body, now);
    const cases = [null, signBillingWebhook("x".repeat(40), body, now), "t=1,v1=zz", signBillingWebhook(secret, body, new Date(now.getTime() - 6 * 60_000))];
    for (const signature of cases) expect(webhooks.parse(body, headers(signature)).ok).toBe(false);
    const tampered = webhooks.parse(body.replace("fake_abc", "fake_outra"), headers(valid));
    expect(!tampered.ok && tampered.error.code).toBe("unauthorized");
  });

  it("com assinatura válida, corpo que não é um evento conhecido é inválido (não 401)", () => {
    const strange = JSON.stringify({ id: "evt_1", type: "invoice.deleted", invoiceId: "fake_abc", occurredAt: now.toISOString() });
    const result = webhooks.parse(strange, headers(signBillingWebhook(secret, strange, now)));
    expect(!result.ok && result.error.code).toBe("validation_failed");
    const notJson = webhooks.parse("{", headers(signBillingWebhook(secret, "{", now)));
    expect(!notJson.ok && notJson.error.code).toBe("validation_failed");
  });
});

describe("HandlePaymentWebhook", () => {
  const handler = (events: PaymentEvent[], applied: AppliedEvent[]) => {
    const apply = vi.fn();
    for (const a of applied) apply.mockResolvedValueOnce(a);
    const webhooks = { gateway: "fake", parse: vi.fn().mockReturnValue(ok(events)) };
    const publisher = bus();
    return { apply, publisher, useCase: new HandlePaymentWebhook(() => webhooks, { apply }, publisher) };
  };

  it("aplica cada evento e conta o que aconteceu", async () => {
    const { apply, useCase } = handler(
      [event(), event({ eventId: "evt_2" }), event({ eventId: "evt_3" }), event({ eventId: "evt_4" })],
      [
        { outcome: "applied", change: change("pending", "active") },
        { outcome: "duplicate", change: null },
        { outcome: "unknown_invoice", change: null },
        { outcome: "ignored", change: null },
      ],
    );
    const result = await useCase.execute("{}", new Headers());
    expect(result).toEqual({ ok: true, value: { received: 4, applied: 1, ignored: 1, duplicate: 1, unknown: 1, invalid: 0 } });
    expect(apply).toHaveBeenCalledWith("fake", event());
  });

  it("assinatura inválida: 401 e nada é aplicado", async () => {
    const apply = vi.fn();
    const webhooks = { gateway: "fake", parse: vi.fn().mockReturnValue(err(new UnauthorizedError())) };
    const result = await new HandlePaymentWebhook(() => webhooks, { apply }, bus()).execute("{}", new Headers());
    expect(!result.ok && result.error.code).toBe("unauthorized");
    expect(apply).not.toHaveBeenCalled();
  });

  it("evento malformado vindo do adaptador é contado como inválido, sem tocar no banco", async () => {
    const { apply, useCase } = handler([event({ eventId: "" })], []);
    const result = await useCase.execute("{}", new Headers());
    expect(result.ok && result.value).toMatchObject({ received: 1, invalid: 1, applied: 0 });
    expect(apply).not.toHaveBeenCalled();
  });

  it("publica a reativação quando o pagamento tira a assinatura da suspensão, e a suspensão no estorno", async () => {
    const reactivated = handler([event()], [{ outcome: "applied", change: change("suspended", "active") }]);
    await reactivated.useCase.execute("{}", new Headers());
    expect(reactivated.publisher.publish).toHaveBeenCalledExactlyOnceWith("billing.SubscriptionReactivated", { subscriptionId: "s1", ownerId: "dono" });

    const refunded = handler([event({ kind: "refunded" })], [{ outcome: "applied", change: change("active", "suspended") }]);
    await refunded.useCase.execute("{}", new Headers());
    expect(refunded.publisher.publish).toHaveBeenCalledExactlyOnceWith("billing.SubscriptionSuspended", { subscriptionId: "s1", ownerId: "dono" });
  });

  it("primeiro pagamento e entrada na carência não publicam nada", async () => {
    const { publisher, useCase } = handler(
      [event(), event({ eventId: "evt_2", kind: "overdue" })],
      [
        { outcome: "applied", change: change("pending", "active") },
        { outcome: "applied", change: change("active", "past_due") },
      ],
    );
    await useCase.execute("{}", new Headers());
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});

describe("EnforceOverdue", () => {
  const dayOf = (date: Date) => date.toISOString().slice(0, 10);

  it("marca as vencidas até hoje e suspende quem venceu há mais dias que a carência", async () => {
    const ledger = { markOverdue: vi.fn().mockResolvedValue([change("active", "past_due")]), suspendOverdue: vi.fn().mockResolvedValue([change("past_due", "suspended")]) };
    const publisher = bus();
    const result = await new EnforceOverdue(ledger, publisher, () => 5, () => now, dayOf).execute();

    expect(result).toEqual({ overdue: 1, suspended: 1 });
    expect(ledger.markOverdue).toHaveBeenCalledWith("2026-10-02");
    expect(ledger.suspendOverdue).toHaveBeenCalledWith("2026-09-27");
    expect(publisher.publish).toHaveBeenCalledExactlyOnceWith("billing.SubscriptionSuspended", { subscriptionId: "s1", ownerId: "dono" });
  });

  it("carência zero suspende no dia seguinte ao vencimento", async () => {
    const ledger = { markOverdue: vi.fn().mockResolvedValue([]), suspendOverdue: vi.fn().mockResolvedValue([]) };
    await new EnforceOverdue(ledger, bus(), () => 0, () => now, dayOf).execute();
    expect(ledger.suspendOverdue).toHaveBeenCalledWith("2026-10-02");
  });
});
