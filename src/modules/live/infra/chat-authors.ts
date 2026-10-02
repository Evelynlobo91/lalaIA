import { publicProfiles } from "@/modules/identity";
import { levelsOf } from "@/modules/progression";
import type { ChatAuthor } from "../domain/chat";
import type { ChatAuthors } from "../features/chat-feed/chat-feed.use-case";

/** Nome, foto e nível de explorador de quem escreveu, pelas APIs públicas de identity e progression. */
export class ModuleChatAuthors implements ChatAuthors {
  async describe(userIds: string[]): Promise<Map<string, ChatAuthor>> {
    const [profiles, levels] = await Promise.all([publicProfiles(userIds), levelsOf(userIds)]);
    return new Map(profiles.map((p) => [p.id, { name: p.displayName, avatarUrl: p.avatarUrl, level: levels[p.id] ?? 1 }]));
  }
}
