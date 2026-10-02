import "server-only";
import { getCurrentUser } from "@/modules/identity";
import type { ButtonSize } from "@/shared/ui";
import { favoriteRepository } from "../../../composition";
import type { EntityType } from "../../../domain/favorite";
import { FavoriteButton } from "./favorite-button";

/**
 * Componente de servidor pronto para páginas de detalhe: lê a sessão e se o item já é favorito,
 * e renderiza o `FavoriteButton`. Ex.: `<FavoriteToggle entityType="event" entityId={id} />`.
 */
export async function FavoriteToggle({ entityType, entityId, size, className }: { entityType: EntityType; entityId: string; size?: ButtonSize; className?: string }) {
  const user = await getCurrentUser();
  const favorited = user ? await favoriteRepository().has(user.id, { entityType, entityId }) : false;
  return <FavoriteButton entityType={entityType} entityId={entityId} initialFavorited={favorited} signedIn={user !== null} size={size} className={className} />;
}
