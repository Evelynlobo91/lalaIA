import { z } from "zod";
import { BusinessRuleError, ok, err, type DomainError, type Result } from "@/shared/kernel";

export const likeMessageSchema = z.object({ messageId: z.uuid() });
export const myLikesQuerySchema = z.object({ streamId: z.uuid() });

/** Curtidas das mensagens: uma por pessoa e por mensagem. */
export interface MessageLikeStore {
  /** Alterna a curtida como o usuário (RLS: mensagem visível, chat aberto). null se o banco recusar. */
  toggle(userId: string, messageId: string): Promise<{ liked: boolean; likes: number } | null>;
  /** O que a pessoa curtiu nesta transmissão: mensagens e a própria live. */
  mine(userId: string, streamId: string): Promise<{ messageIds: string[]; likedLive: boolean }>;
}

/** #190 — Curtir (ou descurtir) uma mensagem do chat. Só com o chat aberto e a mensagem visível. */
export class ToggleMessageLike {
  constructor(private readonly likes: Pick<MessageLikeStore, "toggle">) {}

  async execute(user: { id: string }, messageId: string): Promise<Result<{ liked: boolean; likes: number }, DomainError>> {
    const toggled = await this.likes.toggle(user.id, messageId);
    return toggled ? ok(toggled) : err(new BusinessRuleError("message_unavailable", "Esta mensagem não está mais disponível."));
  }
}
