import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { Plan } from "../domain/plan";
import { addOneMonth, type NewInvoice } from "../domain/subscription";
import { GetMySubscription } from "../features/partner-subscription/partner-subscription";
import { PostgresMySubscriptionReader } from "./postgres-my-subscription-reader";
import { PostgresPlanRepository } from "./postgres-plan-repository";
import { PostgresSubscriptionStore } from "./postgres-subscription-store";

const db = sql();
const store = new PostgresSubscriptionStore(db);
const plans = new PostgresPlanRepository(db);
const reader = new PostgresMySubscriptionReader(db);
const view = new GetMySubscription(reader, plans);
const owner = crypto.randomUUID();
const other = crypto.randomUUID();
const finance = crypto.randomUUID();
const tag = `mine${Date.now()}`;
const start = new Date("2041-02-10T12:00:00Z");
let paid: Plan;

const invoice = (id: string, periodStart: Date, dueOn: string): NewInvoice => ({
  planId: paid.id,
  amountCents: paid.priceCents,
  periodStart,
  periodEnd: addOneMonth(periodStart),
  dueOn,
  gateway: "fake",
  gatewayInvoiceId: `${tag}-${id}`,
  paymentUrl: `/pagamento/simulado/${id}`,
});

beforeAll(async () => {
  for (const [id, role] of [[owner, "partner"], [other, "partner"], [finance, "finance"]] as const) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${tag}-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    await db`insert into identity.user_roles (user_id, role) values (${id}, ${role})`;
  }
  paid = (await plans.create(finance, { code: `${tag}-pago`, name: `Pago ${tag}`, description: "", priceCents: 9900, features: ["live", "destaque"], isDefault: false, active: true }))!;
  const saved = await store.save({ ownerId: owner, planId: paid.id, pendingPlanId: null, status: "active", periodStart: start, periodEnd: addOneMonth(start), invoice: invoice("a", start, "2041-02-13") });
  await db`update billing.invoices set status = 'paid', paid_at = ${start} where id = ${saved.invoice!.id}`;
  await store.addInvoice(saved.subscription.id, invoice("b", addOneMonth(start), "2041-03-10"));
  // A outra conta também tem assinatura e fatura.
  await store.save({ ownerId: other, planId: paid.id, pendingPlanId: null, status: "pending", periodStart: null, periodEnd: null, invoice: invoice("c", start, "2041-02-13") });
});

afterAll(async () => {
  await db`delete from billing.subscriptions where owner_id in (${owner}, ${other})`;
  await db`delete from billing.plans where code like ${`${tag}-%`}`;
  await db`delete from auth.users where id in (${owner}, ${other}, ${finance})`;
  await db.end();
});

describe("assinatura e faturas do parceiro (#155)", () => {
  it("mostra o plano que vale, a renovação e as faturas da mais recente para a mais antiga, com segunda via só da que está em aberto", async () => {
    const mine = await view.execute(owner);
    expect(mine).toMatchObject({ status: "active", currentPlan: { name: `Pago ${tag}`, priceCents: 9900 }, renewsAt: addOneMonth(start), pendingPlanName: null });
    expect(mine.invoices.map((i) => [i.status, i.dueOn, i.paymentUrl, i.planName])).toEqual([
      ["pending", "2041-03-10", "/pagamento/simulado/b", `Pago ${tag}`],
      ["paid", "2041-02-13", null, `Pago ${tag}`],
    ]);
  });

  it("cada conta só recebe as próprias faturas", async () => {
    const theirs = await view.execute(other);
    expect(theirs).toMatchObject({ status: "pending", pendingPlanName: `Pago ${tag}` });
    expect(theirs.currentPlan?.name).toBe("Básico");
    expect(theirs.invoices.map((i) => i.paymentUrl)).toEqual(["/pagamento/simulado/c"]);
  });

  it("RLS: mesmo sem filtro por dono, uma conta não lê a assinatura nem as faturas de outra", async () => {
    const allInvoices = await asUser(other, (tx) => tx<{ payment_url: string }[]>`select payment_url from billing.invoices`, db);
    expect(allInvoices.map((i) => i.payment_url)).toEqual(["/pagamento/simulado/c"]);
    const allSubscriptions = await asUser(other, (tx) => tx<{ owner_id: string }[]>`select owner_id from billing.subscriptions`, db);
    expect(allSubscriptions.map((s) => s.owner_id)).toEqual([other]);
    // E pedir as de outra pessoa pelo leitor (que roda como ela mesma) não mistura as contas.
    expect((await reader.invoices(owner, 50)).every((i) => i.paymentUrl !== "/pagamento/simulado/c")).toBe(true);
  });

  it("plano desativado depois: a fatura continua na lista, com o nome do plano indisponível para o parceiro", async () => {
    await plans.update(finance, paid.id, { code: `${tag}-pago`, name: `Pago ${tag}`, description: "", priceCents: 9900, features: ["live", "destaque"], isDefault: false, active: false });
    const mine = await view.execute(owner);
    expect(mine.invoices).toHaveLength(2);
    expect(mine.invoices.every((i) => i.planName === "Plano fora do catálogo")).toBe(true);
    // O plano que a conta já tem continua aparecendo no resumo.
    expect(mine.currentPlan?.name).toBe(`Pago ${tag}`);
  });
});
