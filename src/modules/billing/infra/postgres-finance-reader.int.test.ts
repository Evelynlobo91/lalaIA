import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import type { Plan } from "../domain/plan";
import { addOneMonth, type NewInvoice } from "../domain/subscription";
import type { FinanceTotals } from "../features/finance-panel/finance-panel";
import { PostgresFinanceReader } from "./postgres-finance-reader";
import { PostgresPaymentLedger } from "./postgres-payment-ledger";
import { PostgresPlanRepository } from "./postgres-plan-repository";
import { PostgresSubscriptionStore } from "./postgres-subscription-store";

const db = sql();
const store = new PostgresSubscriptionStore(db);
const plans = new PostgresPlanRepository(db);
const ledger = new PostgresPaymentLedger(db);
const reader = new PostgresFinanceReader(db);
const ids = { finance: crypto.randomUUID(), commercial: crypto.randomUUID(), emDia: crypto.randomUUID(), devedor: crypto.randomUUID(), novo: crypto.randomUUID() };
const tag = `fin${Date.now()}`;
const since = new Date(Date.now() - 30 * 86_400_000);
const start = new Date();
let plan: Plan;
let before: FinanceTotals;

const invoice = (id: string, dueOn: string): NewInvoice => ({ planId: plan.id, amountCents: plan.priceCents, periodStart: start, periodEnd: addOneMonth(start), dueOn, gateway: "fake", gatewayInvoiceId: `${tag}-${id}`, paymentUrl: `/pagamento/simulado/${id}` });
const pay = (id: string) => ledger.apply("fake", { eventId: `${tag}-evt-${id}`, kind: "paid", gatewayInvoiceId: `${tag}-${id}`, occurredAt: new Date() });

beforeAll(async () => {
  for (const [name, id] of Object.entries(ids)) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${tag}-${name}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    const role = name === "finance" || name === "commercial" ? name : "partner";
    await db`insert into identity.user_roles (user_id, role) values (${id}, ${role})`;
  }
  plan = (await plans.create(ids.finance, { code: `${tag}-pago`, name: `Pago ${tag}`, description: "", priceCents: 12000, features: ["live"], isDefault: false, active: true }))!;
  before = await reader.totals(ids.finance, since);

  // Em dia: assinou e pagou.
  await store.save({ ownerId: ids.emDia, planId: plan.id, pendingPlanId: null, status: "pending", periodStart: null, periodEnd: null, invoice: invoice("a", "2099-01-10") });
  await pay("a");
  // Devedor: pagou a primeira, a renovação venceu e ele foi suspenso.
  const devedor = await store.save({ ownerId: ids.devedor, planId: plan.id, pendingPlanId: null, status: "pending", periodStart: null, periodEnd: null, invoice: invoice("b", "2099-01-10") });
  await pay("b");
  await db`insert into billing.invoices (subscription_id, plan_id, amount_cents, period_start, period_end, due_on, status, gateway, gateway_invoice_id, payment_url)
           values (${devedor.subscription.id}, ${plan.id}, 12000, ${addOneMonth(start)}, ${addOneMonth(addOneMonth(start))}, '2020-01-10', 'overdue', 'fake', ${`${tag}-c`}, '/pagamento/simulado/c')`;
  await db`update billing.subscriptions set status = 'suspended' where id = ${devedor.subscription.id}`;
  // Novo: assinou e ainda não pagou.
  await store.save({ ownerId: ids.novo, planId: plan.id, pendingPlanId: null, status: "pending", periodStart: null, periodEnd: null, invoice: invoice("d", "2099-01-10") });
});

afterAll(async () => {
  await db`delete from billing.subscriptions where owner_id in ${db([ids.emDia, ids.devedor, ids.novo])}`;
  await db`delete from billing.plans where code like ${`${tag}-%`}`;
  await db`delete from auth.users where id in ${db(Object.values(ids))}`;
  await db.end();
});

describe("PostgresFinanceReader (#156)", () => {
  it("totais: recebido, MRR, em aberto, vencido e assinaturas por situação (diferença em relação a antes do teste)", async () => {
    const after = await reader.totals(ids.finance, since);
    expect(after.receivedCents - before.receivedCents).toBe(24000);
    expect(after.paidInvoices - before.paidInvoices).toBe(2);
    // MRR só conta quem está em dia ou na carência: o suspenso e o que ainda não pagou ficam de fora.
    expect(after.mrrCents - before.mrrCents).toBe(12000);
    expect(after.pendingCents - before.pendingCents).toBe(12000);
    expect(after.overdueCents - before.overdueCents).toBe(12000);
    expect(after.subscriptions.active - before.subscriptions.active).toBe(1);
    expect(after.subscriptions.suspended - before.subscriptions.suspended).toBe(1);
    expect(after.subscriptions.pending - before.subscriptions.pending).toBe(1);
  });

  it("recebimentos fora do período não contam", async () => {
    const future = await reader.totals(ids.finance, new Date(Date.now() + 86_400_000));
    expect(future.receivedCents).toBe(0);
    expect(future.paidInvoices).toBe(0);
    // MRR e saldos são de hoje, não do período.
    expect(future.mrrCents).toBeGreaterThanOrEqual(12000);
  });

  it("inadimplentes: quem tem fatura vencida, com o valor e a data mais antiga", async () => {
    const mine = (await reader.delinquents(ids.finance, 500)).filter((d) => d.ownerId === ids.devedor);
    expect(mine).toEqual([{ subscriptionId: expect.any(String), ownerId: ids.devedor, planName: `Pago ${tag}`, status: "suspended", overdueCents: 12000, oldestDueOn: "2020-01-10" }]);
    expect((await reader.delinquents(ids.finance, 500)).some((d) => d.ownerId === ids.emDia)).toBe(false);
  });

  it("faturas: todas ou por situação, com o dono e o plano", async () => {
    const owners = [ids.emDia, ids.devedor, ids.novo];
    const ours = async (status?: "paid" | "overdue" | "pending") => (await reader.invoices(ids.finance, status, 500)).filter((i) => owners.includes(i.ownerId));
    expect(await ours()).toHaveLength(4);
    expect((await ours("paid")).map((i) => i.ownerId).sort()).toEqual([ids.emDia, ids.devedor].sort());
    expect(await ours("overdue")).toMatchObject([{ ownerId: ids.devedor, amountCents: 12000, dueOn: "2020-01-10", planName: `Pago ${tag}` }]);
    expect(await ours("pending")).toMatchObject([{ ownerId: ids.novo, paidAt: null }]);
  });

  it("quem não é do financeiro não vê nada: totais zerados e listas vazias (RLS)", async () => {
    const totals = await reader.totals(ids.commercial, since);
    expect(totals).toMatchObject({ receivedCents: 0, paidInvoices: 0, mrrCents: 0, pendingCents: 0, overdueCents: 0 });
    expect(Object.values(totals.subscriptions).every((n) => n === 0)).toBe(true);
    expect(await reader.delinquents(ids.commercial, 500)).toEqual([]);
    expect(await reader.invoices(ids.commercial, undefined, 500)).toEqual([]);
    // O próprio parceiro, pelo leitor do financeiro, só enxerga as próprias faturas.
    expect((await reader.invoices(ids.novo, undefined, 500)).map((i) => i.ownerId)).toEqual([ids.novo]);
  });
});
