import { z } from "zod";
import { ok, type DomainError, type Result } from "@/shared/kernel";
import type { ProfileRepository } from "../../domain/profile";

export const editProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Informe seu nome.").max(80, "Use no máximo 80 caracteres."),
});

export type EditProfileInput = z.infer<typeof editProfileSchema>;

/** RF03 — Editar dados pessoais (nome de exibição). O e-mail muda por fluxo próprio, com confirmação. */
export class EditProfile {
  constructor(private readonly profiles: Pick<ProfileRepository, "updateDisplayName">) {}

  async execute(userId: string, input: EditProfileInput): Promise<Result<{ displayName: string }, DomainError>> {
    await this.profiles.updateDisplayName(userId, input.displayName);
    return ok({ displayName: input.displayName });
  }
}
