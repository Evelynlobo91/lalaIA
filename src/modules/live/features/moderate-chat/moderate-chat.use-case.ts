import { z } from "zod";
import { BusinessRuleError, ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { ChatMessage } from "../../domain/chat";
import type { ChatRoomReader } from "../send-chat-message/send-chat-message.use-case";

/** Ações de moderação sobre uma mensagem (o alvo de silenciar/banir é quem a escreveu). */
export const CHAT_MODERATION_ACTIONS = ["delete", "pin", "unpin", "mute5", "mute60", "muteLive", "ban"] as const;
export type ChatModerationAction = (typeof CHAT_MODERATION_ACTIONS)[number];

export const CHAT_SLOW_OPTIONS = [0, 10, 30] as const;
export type ChatSlowSeconds = (typeof CHAT_SLOW_OPTIONS)[number];

export const moderateMessageSchema = z.object({ messageId: z.uuid(), action: z.enum(CHAT_MODERATION_ACTIONS) });
export const chatSettingsSchema = z.object({
  streamId: z.uuid(),
  chatEnabled: z.enum(["on", "off"]).transform((v) => v === "on"),
  slowSeconds: z.coerce.number().pipe(z.union([z.literal(0), z.literal(10), z.literal(30)], { error: "Escolha o modo lento." })),
});
export const liftRestrictionSchema = z.object({ restrictionId: z.uuid() });

/** Quem age: o id vem da sessão; `canModerateAll` é a capacidade `content:edit` (moderação da plataforma). */
export type ChatModerator = { id: string; canModerateAll: boolean };

export type ChatRestriction = { id: string; userId: string; kind: "mute" | "ban"; streamId: string | null; expiresAt: Date | null; createdAt: Date };

/** Escritas de moderação, como o usuário (a RLS confere de novo quem é o anfitrião ou a moderação). */
export interface ChatModerationStore {
  /** Mensagem (mesmo apagada) com o autor, para decidir a ação. Leitura do sistema. */
  find(messageId: string): Promise<(ChatMessage & { deleted: boolean }) | null>;
  /** false se o banco recusar ou a mensagem já estiver apagada. */
  remove(actorId: string, messageId: string): Promise<boolean>;
  /** Fixa (desafixando a anterior da transmissão) ou desafixa. false se o banco recusar. */
  setPinned(actorId: string, streamId: string, messageId: string, pinned: boolean): Promise<boolean>;
  /** Silencia na transmissão até `expiresAt` (null = a live toda). Silenciar de novo troca o prazo. */
  mute(actorId: string, restriction: { ownerId: string; streamId: string; userId: string; expiresAt: Date | null }): Promise<void>;
  /** Bane dos chats do parceiro (idempotente). */
  ban(actorId: string, restriction: { ownerId: string; userId: string }): Promise<void>;
  /** Silêncios e banimentos do parceiro que ainda valem, dos mais recentes para os mais antigos. */
  listActive(actorId: string, ownerId: string): Promise<ChatRestriction[]>;
  /** Retira um silêncio ou banimento. false se não existe ou não é do parceiro. */
  lift(actorId: string, restrictionId: string): Promise<boolean>;
  /** Liga/desliga o chat e ajusta o modo lento da transmissão. false se o banco recusar. */
  saveSettings(actorId: string, streamId: string, settings: { chatEnabled: boolean; slowSeconds: number }): Promise<boolean>;
}

const notAllowed = () => err(new ForbiddenError("Só o anfitrião da live (ou a moderação) faz isso."));
const MUTE_MINUTES: Partial<Record<ChatModerationAction, number>> = { mute5: 5, mute60: 60 };

/**
 * #192 — Moderação de uma mensagem do chat. O anfitrião (dono da transmissão) e a moderação da plataforma
 * apagam, fixam, silenciam e banem; o autor só apaga a própria mensagem. Silenciar e banir miram quem escreveu
 * a mensagem (a tela nunca recebe o id das pessoas).
 */
export class ModerateChatMessage {
  constructor(
    private readonly rooms: ChatRoomReader,
    private readonly moderation: Pick<ChatModerationStore, "find" | "remove" | "setPinned" | "mute" | "ban">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: ChatModerator, messageId: string, action: ChatModerationAction): Promise<Result<{ messageId: string; action: ChatModerationAction }, DomainError>> {
    const message = await this.moderation.find(messageId);
    if (!message) return err(new NotFoundError("Mensagem"));
    const room = await this.rooms.room(message.streamId);
    if (!room) return err(new NotFoundError("Mensagem"));

    const moderates = actor.canModerateAll || room.ownerId === actor.id;
    const isAuthor = message.userId !== null && message.userId === actor.id;
    const done = ok({ messageId, action });

    if (action === "delete") {
      if (!moderates && !isAuthor) return notAllowed();
      if (message.deleted) return done;
      return (await this.moderation.remove(actor.id, messageId)) ? done : notAllowed();
    }
    if (!moderates) return notAllowed();

    if (action === "pin" || action === "unpin") {
      if (message.deleted) return err(new NotFoundError("Mensagem"));
      return (await this.moderation.setPinned(actor.id, message.streamId, messageId, action === "pin")) ? done : notAllowed();
    }

    // Silenciar ou banir quem escreveu.
    if (!message.userId) return err(new BusinessRuleError("author_removed", "Quem escreveu esta mensagem não tem mais conta."));
    if (message.userId === room.ownerId) return err(new BusinessRuleError("cannot_restrict_host", "O anfitrião não pode ser silenciado nem banido do próprio chat."));
    if (action === "ban") {
      await this.moderation.ban(actor.id, { ownerId: room.ownerId, userId: message.userId });
    } else {
      const minutes = MUTE_MINUTES[action];
      const expiresAt = minutes ? new Date(this.now().getTime() + minutes * 60_000) : null;
      await this.moderation.mute(actor.id, { ownerId: room.ownerId, streamId: message.streamId, userId: message.userId, expiresAt });
    }
    return done;
  }
}

/** O anfitrião (ou a moderação) liga/desliga o chat da transmissão e ajusta o modo lento. */
export class SaveChatSettings {
  constructor(
    private readonly rooms: ChatRoomReader,
    private readonly moderation: Pick<ChatModerationStore, "saveSettings">,
  ) {}

  async execute(actor: ChatModerator, streamId: string, settings: { chatEnabled: boolean; slowSeconds: number }): Promise<Result<{ streamId: string; chatEnabled: boolean; slowSeconds: number }, DomainError>> {
    const room = await this.rooms.room(streamId);
    if (!room) return err(new NotFoundError("Transmissão"));
    if (!actor.canModerateAll && room.ownerId !== actor.id) return notAllowed();
    return (await this.moderation.saveSettings(actor.id, streamId, settings)) ? ok({ streamId, ...settings }) : notAllowed();
  }
}

/** O parceiro retira um silêncio ou banimento do próprio chat. */
export class LiftChatRestriction {
  constructor(private readonly moderation: Pick<ChatModerationStore, "lift">) {}

  async execute(actor: ChatModerator, restrictionId: string): Promise<Result<{ restrictionId: string }, DomainError>> {
    return (await this.moderation.lift(actor.id, restrictionId)) ? ok({ restrictionId }) : err(new NotFoundError("Restrição"));
  }
}

/** Quem vê uma restrição ativa do parceiro, com o nome da pessoa (API pública de identity). */
export type ChatRestrictionView = Omit<ChatRestriction, "userId"> & { userName: string };

export class ListChatRestrictions {
  constructor(
    private readonly moderation: Pick<ChatModerationStore, "listActive">,
    private readonly names: (userIds: string[]) => Promise<Map<string, string>>,
  ) {}

  async execute(owner: { id: string }): Promise<ChatRestrictionView[]> {
    const active = await this.moderation.listActive(owner.id, owner.id);
    if (active.length === 0) return [];
    const names = await this.names([...new Set(active.map((r) => r.userId))]);
    return active.map(({ userId, ...rest }) => ({ ...rest, userName: names.get(userId) ?? "Usuário removido" }));
  }
}
