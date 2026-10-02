import { z } from "zod";
import { entityTypes } from "../../domain/favorite";

export const favoriteTabs = ["lugares", "eventos"] as const;
export type FavoriteTab = (typeof favoriteTabs)[number];

/** Aba vinda da URL (/perfil/favoritos?aba=eventos). Valor desconhecido volta para "lugares". */
export const favListSchema = z.object({
  aba: z.enum(favoriteTabs).catch("lugares"),
});

/** Remover da lista: só o item; o usuário vem da sessão. */
export const removeFavoriteSchema = z.object({
  entityType: z.enum(entityTypes, { error: "Tipo de item inválido." }),
  entityId: z.uuid({ error: "Item inválido." }),
});
