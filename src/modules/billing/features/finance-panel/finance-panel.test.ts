import { describe, expect, it, vi } from "vitest";
import { FINANCE_LIST_LIMIT, GetFinancePanel, financeFilterSchema, type FinanceTotals } from "./finance-panel";

const now = new Date("2026-10-02T12:00:00Z");
const reader = { id: "fin", canRead: true, canWrite: false };
const totals: FinanceTotals = {
  receivedCents: 29800,
  paidInvoices: 2,
  refundedCents: 0,
  mrrCents: 44700,
  subscriptions: { pending: 1, active: 2, past_due: 1, suspended: 1, cancelled: 0 },
  pendingCents: 14900,
  overdueCents: 29800,
};

const deps = () => {
  const finance = {
    totals: vi.fn().mockResolvedValue(totals),
    delinquents: vi.fn().mockResolvedValue([{ subscriptionId: "s1", ownerId: "dona", planName: "Pro", status: "suspended", overdueCents: 14900, oldestDueOn: "2026-09-10" }]),
    invoices: vi.fn().mockResolvedValue([
      { id: "i1", ownerId: "dona", planName: "Pro", amountCents: 14900, dueOn: "2026-09-10", status: "overdue", paidAt: null },
      { id: "i2", ownerId: "sumiu", planName: "Pro", amountCents: 14900, dueOn: "2026-09-12", status: "paid", paidAt: now },
    ]),
  };
  const owners = vi.fn().mockResolvedValue(new Map([["dona", { name: "Dona do Bar", email: "dona@exemplo.com" }]]));
  return { finance, owners, useCase: new GetFinancePanel(finance, owners, () => now) };
};

describe("financeFilterSchema", () => {
  it("período e situação da fatura válidos; o resto cai no padrão", () => {
    expect(financeFilterSchema.parse({ periodo: "90", faturas: "overdue" })).toEqual({ periodo: 90, faturas: "overdue" });
    expect(financeFilterSchema.parse({ periodo: "15", faturas: "inventada" })).toEqual({ periodo: 30, faturas: undefined });
    expect(financeFilterSchema.parse({ periodo: ["365", "30"], faturas: "" })).toEqual({ periodo: 365, faturas: undefined });
    expect(financeFilterSchema.parse({})).toEqual({ periodo: 30 });
  });
});

describe("GetFinancePanel", () => {
  it("só quem tem acesso ao financeiro vê; os demais não disparam nenhuma consulta", async () => {
    const { finance, useCase } = deps();
    const result = await useCase.execute({ id: "x", canRead: false, canWrite: false }, {});
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(finance.totals).not.toHaveBeenCalled();
  });

  it("recebimentos contam desde o início do período; listas vêm com o nome de quem paga", async () => {
    const { finance, owners, useCase } = deps();
    const result = await useCase.execute(reader, { periodo: "30" });

    expect(finance.totals).toHaveBeenCalledWith("fin", new Date("2026-09-02T12:00:00Z"));
    expect(finance.invoices).toHaveBeenCalledWith("fin", undefined, FINANCE_LIST_LIMIT);
    expect(owners).toHaveBeenCalledWith(["dona", "sumiu"]);
    expect(result.ok && result.value).toMatchObject({ period: 30, invoiceStatus: undefined, totals });
    expect(result.ok && result.value.delinquents[0]).toMatchObject({ ownerName: "Dona do Bar", ownerEmail: "dona@exemplo.com", status: "suspended", overdueCents: 14900 });
    // Conta excluída: a fatura continua, sem nome.
    expect(result.ok && result.value.invoices.map((i) => i.ownerName)).toEqual(["Dona do Bar", "Conta removida"]);
  });

  it("filtra as faturas pela situação pedida", async () => {
    const { finance, useCase } = deps();
    const result = await useCase.execute(reader, { faturas: "overdue", periodo: "90" });
    expect(finance.invoices).toHaveBeenCalledWith("fin", "overdue", FINANCE_LIST_LIMIT);
    expect(result.ok && result.value).toMatchObject({ period: 90, invoiceStatus: "overdue" });
  });
});
