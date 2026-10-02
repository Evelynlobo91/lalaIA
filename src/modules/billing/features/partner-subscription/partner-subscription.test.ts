import { describe, expect, it, vi } from "vitest";
import type { Plan } from "../../domain/plan";
import type { Invoice, Subscription, SubscriptionStatus } from "../../domain/subscription";
import { GetMySubscription, INVOICES_LIMIT } from "./partner-subscription";

const plan = (id: string, name: string, priceCents: number): Plan => ({ id, code: id, name, description: "", priceCents, features: ["live"], isDefault: priceCents === 0, active: true });
const basico = plan("basico", "Básico", 0);
const pro = plan("pro", "Pro", 14900);
const premium = plan("premium", "Premium", 29900);
const periodEnd = new Date("2026-11-02T15:00:00Z");

const subscription = (status: SubscriptionStatus, patch: Partial<Subscription> = {}): Subscription => ({ id: "s1", ownerId: "dono", planId: "pro", pendingPlanId: null, status, currentPeriodStart: new Date("2026-10-02T15:00:00Z"), currentPeriodEnd: periodEnd, ...patch });
const invoice = (patch: Partial<Invoice & { planName: string | null }> = {}): Invoice & { planName: string | null } => ({
  id: "i1",
  subscriptionId: "s1",
  planId: "pro",
  amountCents: 14900,
  periodStart: new Date("2026-10-02T15:00:00Z"),
  periodEnd,
  dueOn: "2026-10-05",
  status: "pending",
  paymentUrl: "/pagamento/simulado/fake_x",
  paidAt: null,
  planName: "Pro",
  ...patch,
});

const view = (current: Subscription | null, invoices: Array<Invoice & { planName: string | null }> = []) => {
  const reader = { subscription: vi.fn().mockResolvedValue(current), invoices: vi.fn().mockResolvedValue(invoices) };
  const plans = { byId: vi.fn(async (id: string) => [basico, pro, premium].find((p) => p.id === id) ?? null), defaultPlan: vi.fn().mockResolvedValue(basico) };
  return { reader, result: new GetMySubscription(reader, plans).execute("dono") };
};

describe("GetMySubscription", () => {
  it("sem assinatura: vale o plano padrão, sem renovação nem faturas", async () => {
    const { reader, result } = view(null);
    expect(await result).toEqual({ status: null, currentPlan: { id: "basico", name: "Básico", priceCents: 0, features: ["live"] }, renewsAt: null, pendingPlanName: null, invoices: [] });
    expect(reader.invoices).toHaveBeenCalledWith("dono", INVOICES_LIMIT);
  });

  it("em dia num plano pago: mostra o plano e quando renova", async () => {
    const result = await view(subscription("active")).result;
    expect(result).toMatchObject({ status: "active", currentPlan: { name: "Pro" }, renewsAt: periodEnd, pendingPlanName: null });
  });

  it("na carência o plano continua valendo", async () => {
    expect((await view(subscription("past_due")).result).currentPlan?.name).toBe("Pro");
  });

  it("aguardando o primeiro pagamento: vale o padrão e o plano escolhido aparece como pendente", async () => {
    const result = await view(subscription("pending", { currentPeriodStart: null, currentPeriodEnd: null })).result;
    expect(result).toMatchObject({ status: "pending", currentPlan: { name: "Básico" }, renewsAt: null, pendingPlanName: "Pro" });
  });

  it("troca pendente: o plano atual continua e o novo aparece como pendente", async () => {
    const result = await view(subscription("active", { pendingPlanId: "premium" })).result;
    expect(result).toMatchObject({ currentPlan: { name: "Pro" }, pendingPlanName: "Premium" });
  });

  it("suspensa ou cancelada: volta ao plano padrão, sem pendência para a cancelada", async () => {
    expect(await view(subscription("suspended")).result).toMatchObject({ status: "suspended", currentPlan: { name: "Básico" }, renewsAt: null });
    expect(await view(subscription("cancelled", { pendingPlanId: "premium" })).result).toMatchObject({ currentPlan: { name: "Básico" }, pendingPlanName: null });
  });

  it("segunda via só para fatura em aberto ou vencida; plano fora do catálogo tem rótulo próprio", async () => {
    const result = await view(subscription("active"), [
      invoice({ id: "a", status: "pending" }),
      invoice({ id: "b", status: "overdue" }),
      invoice({ id: "c", status: "paid", paidAt: new Date() }),
      invoice({ id: "d", status: "cancelled", planName: null }),
    ]).result;
    expect(result.invoices.map((i) => [i.id, i.paymentUrl])).toEqual([
      ["a", "/pagamento/simulado/fake_x"],
      ["b", "/pagamento/simulado/fake_x"],
      ["c", null],
      ["d", null],
    ]);
    expect(result.invoices[3].planName).toBe("Plano fora do catálogo");
  });
});
