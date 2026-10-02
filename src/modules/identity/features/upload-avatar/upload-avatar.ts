import { z } from "zod";
import { ok, type DomainError, type Result } from "@/shared/kernel";
import type { Logger } from "@/shared/observability";
import { avatarPath, detectAvatarType, type AvatarStorage } from "../../domain/avatar";
import type { ProfileRepository } from "../../domain/profile";

export const uploadAvatarSchema = z.object({
  avatar: z.instanceof(File, { error: "Escolha uma imagem." }),
});

/** RF03 — Foto de perfil: valida o conteúdo real, envia, troca no perfil e apaga a anterior. */
export class UploadAvatar {
  constructor(
    private readonly profiles: Pick<ProfileRepository, "replaceAvatar">,
    private readonly storage: AvatarStorage,
    private readonly log: Pick<Logger, "warn">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string, bytes: Uint8Array): Promise<Result<{ avatarUrl: string }, DomainError>> {
    const type = detectAvatarType(bytes);
    if (!type.ok) return type;

    const path = avatarPath(userId, type.value, this.now());
    await this.storage.upload(path, bytes, type.value.mime);
    const previous = await this.profiles.replaceAvatar(userId, path);

    // Limpeza da foto antiga é melhor-esforço: falhar aqui não pode desfazer a troca.
    if (previous && previous !== path) {
      await this.storage.remove(previous).catch((error) => this.log.warn("não foi possível apagar a foto anterior", { err: error }));
    }
    return ok({ avatarUrl: this.storage.publicUrl(path) });
  }
}
