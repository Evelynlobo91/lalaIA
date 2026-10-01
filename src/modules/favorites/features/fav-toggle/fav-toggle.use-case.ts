import type { DomainEventPublisher } from "@/shared/events";
import { NotFoundError, ok, err, type Result } from "@/shared/kernel";
import "../../domain/events";
import type { FavoriteRepository, FavoriteTargets } from "../../domain/favorite";
import type { FavToggleInput } from "./fav-toggle.schema";

export type FavToggleResult = { favorited: boolean };

const notFoundLabel = { place: "Lugar", event: "Evento" } as const;

/**
 * RF07 — Favoritar/desfavoritar um lugar ou evento. Idempotente: recebe o estado desejado.
 * Só favorita o que existe (consultado pela API pública do módulo dono do item);
 * desfavoritar sempre funciona, mesmo que o item tenha sido removido.
 */
export class ToggleFavorite {
  constructor(
    private readonly favorites: FavoriteRepository,
    private readonly targets: FavoriteTargets,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(userId: string, input: FavToggleInput): Promise<Result<FavToggleResult, NotFoundError>> {
    const key = { entityType: input.entityType, entityId: input.entityId };

    if (!input.favorite) {
      await this.favorites.remove(userId, key);
      return ok({ favorited: false });
    }

    if (!(await this.targets[key.entityType].exists(key.entityId))) return err(new NotFoundError(notFoundLabel[key.entityType]));
    const created = await this.favorites.add(userId, key);
    // Só publica quando o favorito é novo: repetir o pedido não infla a métrica.
    if (created) await this.events.publish("favorites.FavoriteAdded", { userId, ...key });
    return ok({ favorited: true });
  }
}
