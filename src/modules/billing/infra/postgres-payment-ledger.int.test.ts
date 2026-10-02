import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { Plan } from "../domain/plan";
import type { PaymentEvent } from "../domain/payment";
import { addOneMonth, type NewInvoice } from "../domain/subscription";
import { PostgresPaymentLedger } from "./postgres-payment-ledger";
import { PostgresPlanRepository } from "./postgres-plan-repository";
import { PostgresSubscriptionStore } from "./postgres-subscription-store";

const db = sql();
const store = new PostgresSubscriptionStore(db);
const plans = new PostgresPlanRepository(db);
const ledger = new PostgresPaymentLedger(db);
const owner = crypto.randomUUID();
const finance = crypto.randomUUID();
const tag = `pay${Date.now()}`;
const start = new Date("2040-05-10T12:00:00Z");
let paid: Plan;
let premium: Plan;
let seq = 0;

const invoice = (plan: Plan, periodStart: Date, id: string, dueOn = "2040-05-13"): NewInvoice => ({
  planId: plan.id,
  amountCents: plan.priceCents,
  periodStart,
  periodEnd: addOneMonth(periodStart),
  dueOn,
  gateway: "fake",
  gatewayInvoiceId: `${tag}-${id}`,
  paymentUrl: `/pagamento/simulado/${id}`,
});
const event = (kind: PaymentEvent["kind"], id: string, eventId = `${tag}-evt-${++seq}`): PaymentEvent => ({ eventId, kind, gatewayInvoiceId: `${tag}-${id}`, occurredAt: new Date("2040-05-11T12:00:00Z") });
const current = async () => (await store.findByOwner(owner))!;
// O ciclo diário mexe em todas as assinaturas do banco: olhamos só a deste teste.
const mine = <T extends { ownerId: string }>(changes: T[]) => changes.filter((c) => c.ownerId === owner);
const invoiceStatus = async (id: string) => (await db<{ status: string }[]>`select status from billing.invoices where gateway_invoice_id = ${`${tag}-${id}`}`)[0].status;

beforeAll(async () => {
  for (const [id, role] of [[owner, "partner"], [finance, "finance"]] as const) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${tag}-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    await db`insert into identity.user_roles (user_id, role) values (${id}, ${role})`;
  }
  paid = (await plans.create(finance, { code: `${tag}-pago`, name: `Pago ${tag}`, description: "", priceCents: 9900, features: ["live", "destaque"], isDefault: false, active: true }))!;
  premium = (await plans.create(finance, { code: `${tag}-premium`, name: `Premium ${tag}`, description: "", priceCents: 19900, features: ["live", "chat"], isDefault: false, active: true }))!;
  await store.save({ ownerId: owner, planId: paid.id, pendingPlanId: null, status: "pending", periodStart: null, periodEnd: null, invoice: invoice(paid, start, "a") });
});

afterAll(async () => {
  await db`delete from billing.subscriptions where owner_id = ${owner}`;
  await db`delete from billing.plans where code like ${`${tag}-%`}`;
  await db`delete from auth.users where id in (${owner}, ${finance})`;
  await db.end();
});

describe("PostgresPaymentLedger (#154)", () => {
  it("cobrança desconhecida é registrada e ignorada; repetir o mesmo evento é duplicata", async () => {
    const unknown = event("paid", "nao-existe");
    expect(await ledger.apply("fake", unknown)).toEqual({ outcome: "unknown_invoice", change: null });
    expect(await ledger.apply("fake", unknown)).toEqual({ outcome: "duplicate", change: null });
    expect((await current()).status).toBe("pending");
  });

  it("pagamento da primeira fatura: fatura paga, assinatura em dia, plano valendo e o ciclo da fatura", async () => {
    const paidEvent = event("paid", "a");
    const applied = await ledger.apply("fake", paidEvent);
    expect(applied).toMatchObject({ outcome: "applied", change: { ownerId: owner, from: "pending", to: "active" } });
    expect(await invoiceStatus("a")).toBe("paid");
    expect(await current()).toMatchObject({ status: "active", planId: paid.id, currentPeriodStart: start, currentPeriodEnd: addOneMonth(start) });

    // O provedor reenviou o mesmo webhook, e depois mandou outro evento "pago" para a mesma fatura: nada muda.
    expect((await ledger.apply("fake", paidEvent)).outcome).toBe("duplicate");
    expect(await ledger.apply("fake", event("paid", "a"))).toEqual({ outcome: "ignored", change: null });
  });

  it("troca pendente: pagar a fatura do novo plano faz o plano trocar e limpa a pendência", async () => {
    const changeStart = new Date("2040-05-20T12:00:00Z");
    await store.save({ ownerId: owner, planId: paid.id, pendingPlanId: premium.id, status: "active", periodStart: start, periodEnd: addOneMonth(start), invoice: invoice(premium, changeStart, "b") });
    // Fatura da troca vencida não derruba quem está em dia no plano atual.
    expect(await ledger.apply("fake", event("overdue", "b"))).toEqual({ outcome: "applied", change: null });
    expect((await current()).status).toBe("active");

    expect((await ledger.apply("fake", event("paid", "b"))).outcome).toBe("applied");
    expect(await current()).toMatchObject({ status: "active", planId: premium.id, pendingPlanId: null, currentPeriodStart: changeStart });
  });

  it("renovação vencida: entra na carência; passada a carência, suspende; o pagamento reativa", async () => {
    const sub = await current();
    const renewal = invoice(premium, sub.currentPeriodEnd!, "c", "2040-06-20");
    await store.addInvoice(sub.id, renewal);

    // Ciclo diário no dia do vencimento: ainda não venceu.
    expect(mine(await ledger.markOverdue("2040-06-20"))).toEqual([]);
    // No dia seguinte: vencida, assinatura na carência (o plano ainda vale).
    expect(mine(await ledger.markOverdue("2040-06-21"))).toEqual([{ subscriptionId: sub.id, ownerId: owner, from: "active", to: "past_due" }]);
    expect(await invoiceStatus("c")).toBe("overdue");
    expect((await current()).status).toBe("past_due");

    // Dentro da carência (limite antes do vencimento): não suspende.
    expect(mine(await ledger.suspendOverdue("2040-06-20"))).toEqual([]);
    // Venceu antes do limite: suspende.
    expect(mine(await ledger.suspendOverdue("2040-06-26"))).toEqual([{ subscriptionId: sub.id, ownerId: owner, from: "past_due", to: "suspended" }]);
    expect((await current()).status).toBe("suspended");
    expect(mine(await ledger.suspendOverdue("2040-06-26"))).toEqual([]);

    const paidLate = await ledger.apply("fake", event("paid", "c"));
    expect(paidLate).toMatchObject({ outcome: "applied", change: { from: "suspended", to: "active" } });
    expect(await current()).toMatchObject({ status: "active", currentPeriodStart: renewal.periodStart, currentPeriodEnd: renewal.periodEnd });
  });

  it("estorno de uma fatura paga suspende a assinatura na hora", async () => {
    const refunded = await ledger.apply("fake", event("refunded", "c"));
    expect(refunded).toMatchObject({ outcome: "applied", change: { from: "active", to: "suspended" } });
    expect(await invoiceStatus("c")).toBe("refunded");
    // Estorno de fatura que não está paga não faz nada.
    expect(await ledger.apply("fake", event("refunded", "c"))).toEqual({ outcome: "ignored", change: null });
  });

  it("o log é append-only, só o financeiro lê, e sobrevive à exclusão da assinatura", async () => {
    await expect(db`update billing.payment_events set outcome = 'ignored' where gateway_invoice_id like ${`${tag}-%`}`).rejects.toThrow(/append-only/);
    await expect(db`delete from billing.payment_events where gateway_invoice_id like ${`${tag}-%`}`).rejects.toThrow(/append-only/);

    const seen = (userId: string) => asUser(userId, (tx) => tx`select id from billing.payment_events where gateway_invoice_id like ${`${tag}-%`}`, db);
    expect((await seen(finance)).length).toBeGreaterThanOrEqual(8);
    expect(await seen(owner)).toHaveLength(0);

    // Excluir a assinatura (como na exclusão da conta) apaga as faturas, mas não quebra nem apaga o log.
    const before = (await seen(finance)).length;
    await db`delete from billing.subscriptions where owner_id = ${owner}`;
    expect((await seen(finance)).length).toBe(before);
  });
});
