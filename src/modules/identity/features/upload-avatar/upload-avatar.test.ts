import { describe, expect, it, vi } from "vitest";
import { AVATAR_MAX_BYTES, avatarPath, detectAvatarType, type AvatarStorage } from "../../domain/avatar";
import { UploadAvatar } from "./upload-avatar";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBP")]);

describe("detectAvatarType (bytes reais, não a extensão)", () => {
  it.each([
    [PNG, "image/png"],
    [JPG, "image/jpeg"],
    [WEBP, "image/webp"],
  ])("reconhece %#", (bytes, mime) => {
    const res = detectAvatarType(bytes);
    expect(res.ok && res.value.mime).toBe(mime);
  });

  it("recusa arquivo disfarçado (HTML/SVG com nome de imagem)", () => {
    const res = detectAvatarType(new TextEncoder().encode("<svg onload=alert(1)>"));
    expect(res.ok).toBe(false);
  });

  it("recusa vazio e acima de 2 MB", () => {
    expect(detectAvatarType(new Uint8Array()).ok).toBe(false);
    const big = new Uint8Array(AVATAR_MAX_BYTES + 1);
    big.set(PNG);
    const res = detectAvatarType(big);
    expect(!res.ok && res.error.message).toBe("A imagem deve ter no máximo 2 MB.");
  });

  it("caminho fica sempre na pasta do dono", () => {
    expect(avatarPath("u1", { mime: "image/png", extension: "png" }, new Date(1000))).toBe("u1/1000.png");
  });
});

describe("UploadAvatar", () => {
  const setup = (previous: string | null = null) => {
    const storage: AvatarStorage = {
      upload: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      publicUrl: vi.fn((p: string) => `https://cdn/${p}`),
    };
    const profiles = { replaceAvatar: vi.fn().mockResolvedValue(previous) };
    const log = { warn: vi.fn() };
    const useCase = new UploadAvatar(profiles, storage, log, () => new Date(5000));
    return { storage, profiles, log, useCase };
  };

  it("envia para a pasta do usuário, troca no perfil e apaga a foto anterior", async () => {
    const { storage, profiles, useCase } = setup("u1/1.jpg");

    const res = await useCase.execute("u1", PNG);

    expect(res).toEqual({ ok: true, value: { avatarUrl: "https://cdn/u1/5000.png" } });
    expect(storage.upload).toHaveBeenCalledWith("u1/5000.png", PNG, "image/png");
    expect(profiles.replaceAvatar).toHaveBeenCalledWith("u1", "u1/5000.png");
    expect(storage.remove).toHaveBeenCalledWith("u1/1.jpg");
  });

  it("imagem inválida não chega ao Storage nem ao perfil", async () => {
    const { storage, profiles, useCase } = setup();
    const res = await useCase.execute("u1", new TextEncoder().encode("não sou imagem"));
    expect(res.ok).toBe(false);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(profiles.replaceAvatar).not.toHaveBeenCalled();
  });

  it("falha ao apagar a foto antiga só gera aviso (a troca já valeu)", async () => {
    const { storage, log, useCase } = setup("u1/1.jpg");
    vi.mocked(storage.remove).mockRejectedValue(new Error("storage fora"));

    const res = await useCase.execute("u1", PNG);

    expect(res.ok).toBe(true);
    expect(log.warn).toHaveBeenCalled();
  });

  it("primeira foto: nada para apagar", async () => {
    const { storage, useCase } = setup(null);
    await useCase.execute("u1", JPG);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
