import { z } from "zod";
import { entityTypes } from "../../domain/favorite";

/**
 * O cliente manda o estado desejado (`favorite`), não "inverta": repetir o pedido (duplo clique,
 * reenvio da rede) dá o mesmo resultado. O id do usuário nunca vem daqui, só da sessão.
 */
export const favToggleSchema = z.object({
  entityType: z.enum(entityTypes, { error: "Tipo de item inválido." }),
  entityId: z.uuid({ error: "Item inválido." }),
  favorite: z.enum(["true", "false"], { error: "Ação inválida." }).transform((value) => value === "true"),
});

export type FavToggleInput = z.infer<typeof favToggleSchema>;
