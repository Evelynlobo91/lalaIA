import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { Plan } from "../domain/plan";
import { addOneMonth, type NewInvoice } from "../domain/subscription";
import { PlanEntitlements, defaultPlanResolver } from "../features/plans/plans.use-cases";
import { subscriptionPlanResolver } from "../features/subscribe/subscribe.use-cases";
import { FakeBillingGateway } from "./fake-billing-gateway";
import { PostgresPlanRepository } from "./postgres-plan-repository";
import { PostgresSubscriptionStore } from "./postgres-subscription-store";

const db = sql();
const store = new PostgresSubscriptionStore(db);
const plans = new PostgresPlanRepository(db);
const entitlements = new PlanEntitlements(subscriptionPlanResolver(store, defaultPlanResolver(plans)));
const owner = crypto.randomUUID();
const other = crypto.randomUUID();
const finance = crypto.randomUUID();
const tag = `sub${Date.now()}`;
const start = new Date("2039-03-10T12:00:00Z");
let paid: Plan;
let premium: Plan;

const invoice = (plan: Plan, periodStart: Date, id: string): NewInvoice => ({
  planId: plan.id,
  amountCents: plan.priceCents,
  periodStart,
  periodEnd: addOneMonth(periodStart),
  dueOn: "2039-03-13",
  gateway: "fake",
  gatewayInvoiceId: `${tag}-${id}`,
  paymentUrl: `/pagamento/simulado/${id}`,
});

beforeAll(async () => {
  for (const [id, role] of [[owner, "partner"], [other, "partner"], [finance, "finance"]] as const) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${tag}-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    await db`insert into identity.user_roles (user_id, role) values (${id}, ${role})`;
  }
  // Planos pagos exclusivos do teste, com um recurso que o plano padrão não libera.
  paid = (await plans.create(finance, { code: `${tag}-pago`, name: `Pago ${tag}`, description: "", priceCents: 9900, features: ["live", "destaque"], isDefault: false, active: true }))!;
  premium = (await plans.create(finance, { code: `${tag}-premium`, name: `Premium ${tag}`, description: "", priceCents: 19900, features: ["live", "destaque", "chat"], isDefault: false, active: true }))!;
});

afterAll(async () => {
  await db`delete from billing.subscriptions where owner_id in (${owner}, ${other})`;
  await db`delete from billing.plans where code like ${`${tag}-%`}`;
  await db`delete from auth.users where id in (${owner}, ${other}, ${finance})`;
  await db.end();
});

describe("PostgresSubscriptionStore (#153)", () => {
  it("sem assinatura, vale o plano padrão (sem o recurso pago)", async () => {
    expect(await store.findByOwner(owner)).toBeNull();
    expect(await entitlements.has(owner, "destaque")).toBe(false);
    expect(await entitlements.has(owner, "live")).toBe(true);
  });

  it("assinar um plano pago grava a assinatura aguardando pagamento e a fatura, sem liberar o plano ainda", async () => {
    const saved = await store.save({ ownerId: owner, planId: paid.id, pendingPlanId: null, status: "pending", periodStart: null, periodEnd: null, invoice: invoice(paid, start, "a") });
    expect(saved.subscription).toMatchObject({ ownerId: owner, planId: paid.id, status: "pending", currentPeriodStart: null });
    expect(saved.invoice).toMatchObject({ amountCents: 9900, status: "pending", dueOn: "2039-03-13", paymentUrl: "/pagamento/simulado/a", paidAt: null });
    expect((await store.openInvoice(saved.subscription.id))?.id).toBe(saved.invoice!.id);
    expect(await entitlements.has(owner, "destaque")).toBe(false);
  });

  it("com a assinatura em dia, valem os recursos do plano assinado", async () => {
    await store.save({ ownerId: owner, planId: paid.id, pendingPlanId: null, status: "active", periodStart: start, periodEnd: addOneMonth(start), invoice: null });
    const current = await store.findByOwner(owner);
    expect(current).toMatchObject({ status: "active", planId: paid.id });
    expect(current?.plan.code).toBe(`${tag}-pago`);
    expect(await entitlements.has(owner, "destaque")).toBe(true);
    expect(await entitlements.has(owner, "chat")).toBe(false);
    // Outra conta não é afetada.
    expect(await entitlements.has(other, "destaque")).toBe(false);
  });

  it("troca pendente: o plano atual continua valendo e a fatura do plano desistido é cancelada", async () => {
    const sub = (await store.findByOwner(owner))!;
    await store.save({ ownerId: owner, planId: paid.id, pendingPlanId: premium.id, status: "active", periodStart: start, periodEnd: addOneMonth(start), invoice: invoice(premium, new Date("2039-03-20T12:00:00Z"), "b") });
    expect(await store.findByOwner(owner)).toMatchObject({ planId: paid.id, pendingPlanId: premium.id });
    expect(await entitlements.has(owner, "chat")).toBe(false);
    expect((await store.openInvoice(sub.id))?.planId).toBe(premium.id);

    // Desiste da troca: a fatura do Premium deixa de valer; a do plano atual (em aberto desde a assinatura) continua.
    await store.save({ ownerId: owner, planId: paid.id, pendingPlanId: null, status: "active", periodStart: start, periodEnd: addOneMonth(start), invoice: null });
    const statuses = await db<{ plan_id: string; status: string }[]>`select plan_id, status from billing.invoices where subscription_id = ${sub.id} order by created_at`;
    expect(statuses.map((s) => [s.plan_id === paid.id ? "pago" : "premium", s.status])).toEqual([
      ["pago", "pending"],
      ["premium", "cancelled"],
    ]);
  });

  it("renovação: lista as assinaturas em dia que vencem até a data e não têm a fatura do próximo ciclo; é idempotente", async () => {
    const sub = (await store.findByOwner(owner))!;
    const periodEnd = addOneMonth(start);
    const due = (await store.dueForRenewal(new Date("2039-04-11T00:00:00Z"), 500)).filter((s) => s.ownerId === owner);
    expect(due).toHaveLength(1);
    expect(due[0].plan.priceCents).toBe(9900);
    expect((await store.dueForRenewal(new Date("2039-04-01T00:00:00Z"), 500)).some((s) => s.ownerId === owner)).toBe(false);

    const next = invoice(paid, periodEnd, "c");
    expect(await store.addInvoice(sub.id, next)).toMatchObject({ periodStart: periodEnd, status: "pending" });
    expect(await store.addInvoice(sub.id, { ...next, gatewayInvoiceId: `${tag}-c2` })).toBeNull();
    expect((await store.dueForRenewal(new Date("2039-04-11T00:00:00Z"), 500)).some((s) => s.ownerId === owner)).toBe(false);
  });

  it("assinatura suspensa ou cancelada volta para o plano padrão", async () => {
    await db`update billing.subscriptions set status = 'suspended' where owner_id = ${owner}`;
    expect(await entitlements.has(owner, "destaque")).toBe(false);
    await db`update billing.subscriptions set status = 'cancelled', cancelled_at = now() where owner_id = ${owner}`;
    expect(await entitlements.has(owner, "destaque")).toBe(false);
    expect(await entitlements.has(owner, "live")).toBe(true);
  });

  it("RLS: o dono lê a própria assinatura e faturas; outra conta não; o financeiro lê todas; ninguém grava", async () => {
    const mine = (userId: string) => asUser(userId, (tx) => tx`select id from billing.subscriptions where owner_id = ${owner}`, db);
    const invoices = (userId: string) => asUser(userId, (tx) => tx`select i.id from billing.invoices i join billing.subscriptions s on s.id = i.subscription_id where s.owner_id = ${owner}`, db);
    expect(await mine(owner)).toHaveLength(1);
    expect(await mine(other)).toHaveLength(0);
    expect(await mine(finance)).toHaveLength(1);
    expect((await invoices(owner)).length).toBeGreaterThanOrEqual(3);
    expect(await invoices(other)).toHaveLength(0);
    expect((await invoices(finance)).length).toBeGreaterThanOrEqual(3);

    await expect(asUser(owner, (tx) => tx`update billing.subscriptions set status = 'active', cancelled_at = null where owner_id = ${owner}`, db)).rejects.toThrow(/permission denied/);
    await expect(asUser(owner, (tx) => tx`update billing.invoices set status = 'paid', paid_at = now()`, db)).rejects.toThrow(/permission denied/);
  });

  it("o parceiro vê os planos ativos (catálogo), e o provedor simulado é determinístico pela referência", async () => {
    const visible = await asUser(owner, (tx) => tx<{ code: string }[]>`select code from billing.plans`, db);
    expect(visible.map((p) => p.code)).toEqual(expect.arrayContaining(["basico", `${tag}-pago`]));

    const gateway = new FakeBillingGateway();
    const first = await gateway.createCharge({ reference: "dono:pro:2039-03-10" });
    expect(first.gatewayInvoiceId).toMatch(/^fake_[0-9a-f]{24}$/);
    expect(first.paymentUrl).toBe(`/pagamento/simulado/${first.gatewayInvoiceId}`);
    expect(await gateway.createCharge({ reference: "dono:pro:2039-03-10" })).toEqual(first);
    expect((await gateway.createCharge({ reference: "dono:pro:2039-04-10" })).gatewayInvoiceId).not.toBe(first.gatewayInvoiceId);
  });
});
