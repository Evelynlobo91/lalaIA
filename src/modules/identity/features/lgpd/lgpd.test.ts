import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../../domain/session";
import { consentsSchema, deleteAccountSchema } from "./lgpd.schema";
import { DeleteAccount, ExportPersonalData, GetConsents, UpdateConsents } from "./lgpd.use-case";

const user: CurrentUser = { id: "u1", email: "ana@exemplo.com", displayName: "Ana", avatarUrl: null, roles: [] };

describe("consentimentos", () => {
  it("sem escolha registrada usa os padrões; registrada vale a escolha", async () => {
    expect(await new GetConsents({ find: vi.fn().mockResolvedValue(null) }).execute("u1")).toEqual({ analytics: true, geolocation: true, updatedAt: null });
    const saved = { analytics: false, geolocation: true, updatedAt: new Date() };
    expect(await new GetConsents({ find: vi.fn().mockResolvedValue(saved) }).execute("u1")).toEqual(saved);
  });

  it("revogar = desmarcar: checkbox ausente vira false e é salvo", async () => {
    const input = consentsSchema.parse({ geolocation: "on" });
    expect(input).toEqual({ analytics: false, geolocation: true });
    const save = vi.fn();
    expect(await new UpdateConsents({ save }).execute("u1", input)).toEqual({ ok: true, value: input });
    expect(save).toHaveBeenCalledWith("u1", input);
  });
});

describe("ExportPersonalData", () => {
  it("junta as fontes; uma fonte fora do ar não derruba a exportação", async () => {
    const log = { warn: vi.fn() };
    const useCase = new ExportPersonalData(
      [
        { name: "conta", export: async (u) => ({ email: u.email }) },
        { name: "favoritos", export: async () => Promise.reject(new Error("timeout")) },
      ],
      log,
      () => new Date("2026-10-10T12:00:00Z"),
    );
    const data = await useCase.execute(user);
    expect(data.geradoEm).toBe("2026-10-10T12:00:00.000Z");
    expect(data.titular).toEqual({ id: "u1", email: "ana@exemplo.com" });
    expect(data.dados.conta).toEqual({ email: "ana@exemplo.com" });
    expect(data.dados.favoritos).toEqual({ indisponivel: expect.stringContaining("Tente de novo") });
    expect(log.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ source: "favoritos" }));
    expect(data.observacoes.join(" ")).toMatch(/anônimas/);
  });
});

describe("DeleteAccount", () => {
  function setup(avatarPath: string | null = "u1/foto.webp") {
    const calls: string[] = [];
    const deps = {
      events: { publish: vi.fn(async (type: string) => void calls.push(`publish:${type}`)) },
      profiles: { find: vi.fn().mockResolvedValue({ displayName: "Ana", avatarPath }) },
      avatars: { remove: vi.fn(async () => void calls.push("avatar")) },
      accounts: { delete: vi.fn(async () => void calls.push("delete")) },
      session: { signOut: vi.fn(async () => void calls.push("signOut")) },
      log: { warn: vi.fn(), info: vi.fn() },
    };
    const useCase = new DeleteAccount(deps.events as never, deps.profiles, deps.avatars, deps.accounts, deps.session, deps.log);
    return { useCase, deps, calls };
  }

  it("avisa os módulos ANTES de apagar, apaga a foto, a conta e encerra a sessão", async () => {
    const { useCase, deps, calls } = setup();
    expect(await useCase.execute("u1")).toEqual({ ok: true, value: { deleted: true } });
    expect(calls).toEqual(["publish:identity.UserDeleted", "avatar", "delete", "signOut"]);
    expect(deps.events.publish).toHaveBeenCalledWith("identity.UserDeleted", { userId: "u1" });
    expect(deps.avatars.remove).toHaveBeenCalledWith("u1/foto.webp");
  });

  it("sem foto não chama o storage; falha ao apagar a foto não impede a exclusão", async () => {
    const semFoto = setup(null);
    await semFoto.useCase.execute("u1");
    expect(semFoto.deps.avatars.remove).not.toHaveBeenCalled();

    const falha = setup();
    falha.deps.avatars.remove.mockRejectedValueOnce(new Error("storage fora"));
    expect((await falha.useCase.execute("u1")).ok).toBe(true);
    expect(falha.deps.accounts.delete).toHaveBeenCalledWith("u1");
    expect(falha.deps.log.warn).toHaveBeenCalled();
  });

  it("schema: só confirma com EXCLUIR (sem diferenciar maiúsculas)", () => {
    expect(deleteAccountSchema.safeParse({ confirmacao: " excluir " }).success).toBe(true);
    const errado = deleteAccountSchema.safeParse({ confirmacao: "sim" });
    expect(errado.success).toBe(false);
    expect(errado.error?.issues[0]?.message).toBe("Digite EXCLUIR para confirmar.");
  });
});
