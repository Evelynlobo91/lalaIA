import { ValidationError, err, ok, type Result } from "@/shared/kernel";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export type AvatarType = { mime: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" };

// Assinatura real do arquivo (magic bytes). Não confiamos no nome nem no Content-Type enviado.
const signatures: Array<{ type: AvatarType; matches: (b: Uint8Array) => boolean }> = [
  { type: { mime: "image/jpeg", extension: "jpg" }, matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: { mime: "image/png", extension: "png" }, matches: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v) },
  {
    type: { mime: "image/webp", extension: "webp" },
    matches: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
];

/** Valida tamanho e formato real da imagem de perfil. */
export function detectAvatarType(bytes: Uint8Array): Result<AvatarType, ValidationError> {
  if (bytes.length === 0) return err(new ValidationError("Escolha uma imagem."));
  if (bytes.length > AVATAR_MAX_BYTES) return err(new ValidationError("A imagem deve ter no máximo 2 MB."));
  const found = signatures.find((s) => s.matches(bytes));
  if (!found) return err(new ValidationError("Use uma imagem JPG, PNG ou WebP."));
  return ok(found.type);
}

/** Caminho no bucket: sempre dentro da pasta do dono (as políticas do Storage exigem isso). */
export function avatarPath(userId: string, type: AvatarType, now: Date): string {
  return `${userId}/${now.getTime()}.${type.extension}`;
}

export interface AvatarStorage {
  upload(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  remove(path: string): Promise<void>;
  publicUrl(path: string): string;
}
