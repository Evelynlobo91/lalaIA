import { describe, expect, it, vi } from "vitest";
import type { Plan } from "../../domain/plan";
import { addOneMonth, grantsPlan, type Invoice, type Subscription, type SubscriptionStatus } from "../../domain/subscription";
import { cycleRoute } from "./cycle.route";
import { RenewSubscriptions, Subscribe, subscriptionPlanResolver } from "./subscribe.use-cases";

const now = new Date("2026-10-02T15:00:00Z");
const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const partner = { id: "dono", isPartner: true };

const plan = (patch: Partial<Plan> = {}): Plan => ({ id: "pro", code: "pro", name: "Pro", description: "", priceCents: 14900, features: ["live", "destaque"], isDefault: false, active: true, ...patch });
const free = plan({ id: "basico", code: "basico", name: "Básico", priceCents: 0, features: ["live"], isDefault: true });
const premium = plan({ id: "premium", code: "premium", name: "Premium", priceCents: 29900 });

const subscription = (status: SubscriptionStatus, patch: Partial<Subscription & { plan: Plan }> = {}): Subscription & { plan: Plan } => ({
  id: "s1",
  ownerId: "dono",
  planId: "pro",
  pendingPlanId: null,
  status,
  currentPeriodStart: new Date("2026-09-10T00:00:00Z"),
  currentPeriodEnd: new Date("2026-10-10T00:00:00Z"),
  plan: plan(),
  ...patch,
});

const invoiceRow: Invoice = { id: "i1", subscriptionId: "s1", planId: "pro", amountCents: 14900, periodStart: now, periodEnd: addOneMonth(now), dueOn: "2026-10-05", status: "pending", paymentUrl: "/pagamento/simulado/fake_x", paidAt: null };

const deps = (current: (Subscription & { plan: Plan }) | null, catalog: Plan[] = [plan(), free, premium]) => {
  const plans = { findActive: vi.fn(async (id: string) => catalog.find((p) => p.id === id) ?? null) };
  const store = {
    findByOwner: vi.fn().mockResolvedValue(current),
    save: vi.fn(async (input) => ({ subscription: { ...subscription(input.status), planId: input.planId, pendingPlanId: input.pendingPlanId }, invoice: input.invoice ? invoiceRow : null })),
    openInvoice: vi.fn().mockResolvedValue(invoiceRow),
  };
  const gateway = { name: "fake", createCharge: vi.fn().mockResolvedValue({ gatewayInvoiceId: "fake_x", paymentUrl: "/pagamento/simulado/fake_x" }) };
  const customers = { find: vi.fn().mockResolvedValue({ name: "Dona", email: "dona@exemplo.com" }) };
  return { plans, store, gateway, customers, useCase: new Subscribe(plans, store, () => gateway, customers, () => now, dayOf) };
};

describe("datas e regras da assinatura", () => {
  it("um mês de calendário depois, sem pular mês quando o dia não existe", () => {
    expect(addOneMonth(new Date("2026-10-02T15:00:00Z")).toISOString()).toBe("2026-11-02T15:00:00.000Z");
    expect(addOneMonth(new Date("2027-01-31T12:00:00Z")).toISOString()).toBe("2027-02-28T12:00:00.000Z");
    expect(addOneMonth(new Date("2026-12-15T00:00:00Z")).toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("o plano assinado vale em dia e na carência; aguardando, suspensa ou cancelada não", () => {
    expect((["active", "past_due"] as const).every(grantsPlan)).toBe(true);
    expect((["pending", "suspended", "cancelled"] as const).some(grantsPlan)).toBe(false);
  });
});

describe("Subscribe", () => {
  it("primeira assinatura de plano pago: gera a cobrança com vencimento em 3 dias e fica aguardando o pagamento", async () => {
    const { store, gateway, useCase } = deps(null);
    const result = await useCase.execute(partner, "pro");

    expect(result.ok && result.value.invoice?.paymentUrl).toBe("/pagamento/simulado/fake_x");
    expect(gateway.createCharge).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 14900, dueOn: "2026-10-05", customer: { name: "Dona", email: "dona@exemplo.com" } }));
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "dono", planId: "pro", pendingPlanId: null, status: "pending", periodStart: null, periodEnd: null }));
    expect(store.save.mock.calls[0][0].invoice).toMatchObject({ planId: "pro", amountCents: 14900, gateway: "fake", gatewayInvoiceId: "fake_x", periodStart: now, periodEnd: addOneMonth(now) });
  });

  it("plano gratuito vale na hora, sem cobrança", async () => {
    const { store, gateway, useCase } = deps(null);
    const result = await useCase.execute(partner, "basico");
    expect(result.ok && result.value.invoice).toBeNull();
    expect(gateway.createCharge).not.toHaveBeenCalled();
    expect(store.save).toHaveBeenCalledWith({ ownerId: "dono", planId: "basico", pendingPlanId: null, status: "active", periodStart: now, periodEnd: addOneMonth(now), invoice: null });
  });

  it("troca de plano pago com assinatura em dia: o plano atual continua valendo e o novo fica pendente", async () => {
    const current = subscription("active");
    const { store, useCase } = deps(current);
    await useCase.execute(partner, "premium");
    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({ planId: "pro", pendingPlanId: "premium", status: "active", periodStart: current.currentPeriodStart, periodEnd: current.currentPeriodEnd, invoice: expect.objectContaining({ planId: "premium", amountCents: 29900 }) }),
    );
  });

  it("escolher de novo o plano que já está escolhido não cobra outra vez: devolve a fatura em aberto", async () => {
    const { store, gateway, useCase } = deps(subscription("pending"));
    const result = await useCase.execute(partner, "pro");
    expect(result.ok && result.value.invoice?.id).toBe("i1");
    expect(gateway.createCharge).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("voltar para o plano que já vale desfaz a troca pendente, sem cobrança", async () => {
    const { store, gateway, useCase } = deps(subscription("active", { pendingPlanId: "premium" }));
    await useCase.execute(partner, "pro");
    expect(gateway.createCharge).not.toHaveBeenCalled();
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ planId: "pro", pendingPlanId: null, status: "active", invoice: null }));
  });

  it("assinatura suspensa não troca de plano: primeiro paga a fatura em aberto", async () => {
    const { store, useCase } = deps(subscription("suspended"));
    const result = await useCase.execute(partner, "premium");
    expect(!result.ok && result.error.code).toBe("subscription_suspended");
    expect(store.save).not.toHaveBeenCalled();
  });

  it("quem não é parceiro não assina; plano inexistente ou inativo → não encontrado", async () => {
    const { store, useCase } = deps(null);
    const notPartner = await useCase.execute({ id: "x", isPartner: false }, "pro");
    expect(!notPartner.ok && notPartner.error.code).toBe("forbidden");
    const missing = await useCase.execute(partner, "sumiu");
    expect(!missing.ok && missing.error.code).toBe("not_found");
    expect(store.save).not.toHaveBeenCalled();
  });
});

describe("RenewSubscriptions", () => {
  const renewal = (due: Array<Subscription & { plan: Plan }>, added: Invoice | null = invoiceRow) => {
    const store = { dueForRenewal: vi.fn().mockResolvedValue(due), addInvoice: vi.fn().mockResolvedValue(added) };
    const gateway = { name: "fake", createCharge: vi.fn().mockResolvedValue({ gatewayInvoiceId: "fake_y", paymentUrl: "/pagamento/simulado/fake_y" }) };
    const customers = { find: vi.fn().mockResolvedValue({ name: "Dona", email: "dona@exemplo.com" }) };
    return { store, gateway, useCase: new RenewSubscriptions(store, () => gateway, customers, () => now, dayOf) };
  };

  it("emite a fatura do próximo ciclo, com vencimento no fim do ciclo atual", async () => {
    const { store, gateway, useCase } = renewal([subscription("active")]);
    expect(await useCase.execute()).toEqual({ invoiced: 1, skipped: 0, failed: 0 });
    // Procura as assinaturas que vencem nos próximos 5 dias.
    expect(store.dueForRenewal).toHaveBeenCalledWith(new Date("2026-10-07T15:00:00Z"), 200);
    expect(gateway.createCharge).toHaveBeenCalledWith(expect.objectContaining({ dueOn: "2026-10-10", amountCents: 14900 }));
    expect(store.addInvoice).toHaveBeenCalledWith("s1", expect.objectContaining({ periodStart: new Date("2026-10-10T00:00:00Z"), periodEnd: new Date("2026-11-10T00:00:00Z") }));
  });

  it("plano que virou gratuito e fatura que já existia contam como puladas", async () => {
    const freeNow = renewal([subscription("active", { plan: free })]);
    expect(await freeNow.useCase.execute()).toEqual({ invoiced: 0, skipped: 1, failed: 0 });
    expect(freeNow.gateway.createCharge).not.toHaveBeenCalled();

    const duplicated = renewal([subscription("active")], null);
    expect(await duplicated.useCase.execute()).toEqual({ invoiced: 0, skipped: 1, failed: 0 });
  });

  it("a falha de uma cobrança não trava as outras", async () => {
    const { gateway, useCase } = renewal([subscription("active"), subscription("active", { id: "s2", ownerId: "outra" })]);
    gateway.createCharge.mockRejectedValueOnce(new Error("provedor fora do ar"));
    expect(await useCase.execute()).toEqual({ invoiced: 1, skipped: 0, failed: 1 });
  });
});

describe("subscriptionPlanResolver", () => {
  const fallback = vi.fn().mockResolvedValue(free);

  it("em dia ou na carência: vale o plano assinado", async () => {
    for (const status of ["active", "past_due"] as const) {
      const resolver = subscriptionPlanResolver({ findByOwner: vi.fn().mockResolvedValue(subscription(status)) }, fallback);
      expect((await resolver("dono"))?.id).toBe("pro");
    }
  });

  it("sem assinatura, aguardando pagamento, suspensa ou cancelada: vale o plano padrão", async () => {
    for (const current of [null, subscription("pending"), subscription("suspended"), subscription("cancelled")]) {
      const resolver = subscriptionPlanResolver({ findByOwner: vi.fn().mockResolvedValue(current) }, fallback);
      expect((await resolver("dono"))?.id).toBe("basico");
    }
  });
});

describe("rota do ciclo mensal", () => {
  const secret = "s".repeat(40);
  const renew = { execute: vi.fn().mockResolvedValue({ invoiced: 2, skipped: 0, failed: 0 }) } as unknown as RenewSubscriptions;
  const call = (route: (request: Request) => Promise<Response>, authorization?: string) =>
    route(new Request("http://localhost/api/billing/cycle", { method: "POST", headers: authorization ? { authorization } : {} }));

  it("com o segredo certo, roda o ciclo e devolve o resumo", async () => {
    const response = await call(cycleRoute(() => renew, () => secret), `Bearer ${secret}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { invoiced: 2, skipped: 0, failed: 0 } });
  });

  it("sem segredo, com segredo errado ou sem o prefixo Bearer: 401 e nada roda", async () => {
    const execute = vi.fn();
    const route = cycleRoute(() => ({ execute }) as unknown as RenewSubscriptions, () => secret);
    for (const header of [undefined, "Bearer errado", secret, `Bearer ${secret}x`]) expect((await call(route, header)).status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("sem CRON_SECRET configurado (ou curto demais), a rota fica desligada", async () => {
    const execute = vi.fn();
    const useCase = () => ({ execute }) as unknown as RenewSubscriptions;
    expect((await call(cycleRoute(useCase, () => undefined), "Bearer ")).status).toBe(503);
    expect((await call(cycleRoute(useCase, () => "curto"), "Bearer curto")).status).toBe(503);
    expect(execute).not.toHaveBeenCalled();
  });
});
