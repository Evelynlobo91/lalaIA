import { describe, expect, it, vi } from "vitest";
import { BusinessRuleError, err, ok } from "@/shared/kernel";
import { inviteMemberSchema, memberIdSchema } from "./team-members.schema";
import { InviteTeamMember, MAX_TEAM_MEMBERS, RemoveTeamMember, ValidateCodeAtCounter, type TeamMember } from "./team-members.use-case";

const owner = { userId: "dona", email: "Dona@bar.test", partnerId: "p1" };
const member = (email: string, id = email): TeamMember => ({ id, email, invitedAt: new Date("2026-10-02T12:00:00Z"), joined: false });

describe("inviteMemberSchema / memberIdSchema", () => {
  it("normaliza o e-mail (espaços e maiúsculas)", () => {
    expect(inviteMemberSchema.parse({ email: "  Caixa@Bar.Test " })).toEqual({ email: "caixa@bar.test" });
  });

  it("recusa e-mail malformado e id que não é uuid", () => {
    expect(inviteMemberSchema.safeParse({ email: "caixa" }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ email: "" }).success).toBe(false);
    expect(memberIdSchema.safeParse({ memberId: "1" }).success).toBe(false);
  });
});

describe("InviteTeamMember", () => {
  const deps = (current: TeamMember[] = [], added: TeamMember | null = member("caixa@bar.test")) => {
    const team = { list: vi.fn().mockResolvedValue(current), add: vi.fn().mockResolvedValue(added) };
    return { team, useCase: new InviteTeamMember(team) };
  };

  it("dono convida pelo e-mail", async () => {
    const { team, useCase } = deps();
    const result = await useCase.execute(owner, "caixa@bar.test");
    expect(result.ok && result.value.email).toBe("caixa@bar.test");
    expect(team.add).toHaveBeenCalledWith("dona", "p1", "caixa@bar.test");
  });

  it("não convida o próprio e-mail (o dono já tem acesso total)", async () => {
    const { team, useCase } = deps();
    const result = await useCase.execute(owner, "dona@bar.test");
    expect(!result.ok && result.error.code).toBe("validation_failed");
    expect(team.add).not.toHaveBeenCalled();
  });

  it("quem já está na equipe dá conflito (na lista ou na corrida com outro pedido)", async () => {
    const listed = deps([member("caixa@bar.test")]);
    const r1 = await listed.useCase.execute(owner, "caixa@bar.test");
    expect(!r1.ok && r1.error.code).toBe("conflict");
    expect(listed.team.add).not.toHaveBeenCalled();

    const race = deps([], null);
    const r2 = await race.useCase.execute(owner, "caixa@bar.test");
    expect(!r2.ok && r2.error.code).toBe("conflict");
  });

  it(`a equipe tem no máximo ${MAX_TEAM_MEMBERS} pessoas`, async () => {
    const { team, useCase } = deps(Array.from({ length: MAX_TEAM_MEMBERS }, (_, i) => member(`m${i}@bar.test`)));
    const result = await useCase.execute(owner, "caixa@bar.test");
    expect(!result.ok && result.error.code).toBe("team_full");
    expect(team.add).not.toHaveBeenCalled();
  });
});

describe("RemoveTeamMember", () => {
  it("remove da própria equipe; inexistente ou de outra equipe → não encontrado", async () => {
    const remove = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await new RemoveTeamMember({ remove }).execute(owner, "m1")).ok).toBe(true);
    expect(remove).toHaveBeenCalledWith("dona", "p1", "m1");
    const missing = await new RemoveTeamMember({ remove }).execute(owner, "m1");
    expect(!missing.ok && missing.error.code).toBe("not_found");
  });
});

describe("ValidateCodeAtCounter", () => {
  const invalid = err(new BusinessRuleError("invalid_code", "Código inválido."));

  it("quem não atende em nenhum balcão é recusado sem consultar o código", async () => {
    const execute = vi.fn();
    const result = await new ValidateCodeAtCounter(async () => [], { execute }).execute("fulano", "ABCD");
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(execute).not.toHaveBeenCalled();
  });

  it("procura o código nos balcões da pessoa e para no primeiro que reconhece", async () => {
    const execute = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce(ok({ code: "ABCD" }));
    const result = await new ValidateCodeAtCounter(async () => ["p1", "p2", "p3"], { execute }).execute("caixa", "ABCD");
    expect(result.ok).toBe(true);
    expect(execute.mock.calls.map(([author]) => author)).toEqual([
      { userId: "caixa", partnerId: "p1" },
      { userId: "caixa", partnerId: "p2" },
    ]);
  });

  it("código já usado encerra a busca com esse motivo; desconhecido em todos → inválido", async () => {
    const used = err(new BusinessRuleError("code_used", "Este código já foi usado."));
    const first = await new ValidateCodeAtCounter(async () => ["p1", "p2"], { execute: vi.fn().mockResolvedValueOnce(used) }).execute("caixa", "ABCD");
    expect(!first.ok && first.error.code).toBe("code_used");

    const none = await new ValidateCodeAtCounter(async () => ["p1", "p2"], { execute: vi.fn().mockResolvedValue(invalid) }).execute("caixa", "ABCD");
    expect(!none.ok && none.error.code).toBe("invalid_code");
  });
});
