import type { FavoriteKey, FavoriteRepository } from "../../domain/favorite";

/**
 * Só as chaves (tipo + id) dos favoritos do usuário, sem buscar os detalhes nos outros módulos:
 * uma consulta. Usado pela Recomendação (sinal "Está nos seus favoritos"). O id deve vir da sessão.
 */
export class ListFavoriteKeys {
  constructor(private readonly favorites: Pick<FavoriteRepository, "listByUser">) {}

  async execute(userId: string): Promise<FavoriteKey[]> {
    return (await this.favorites.listByUser(userId)).map(({ entityType, entityId }) => ({ entityType, entityId }));
  }
}
