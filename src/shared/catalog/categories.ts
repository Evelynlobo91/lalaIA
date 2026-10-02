// Catálogo único de categorias de experiência, compartilhado por preferências, lugares, eventos
// e recomendação. Adicionar categoria = nova linha aqui (ids estáveis: são gravados no banco).
export const categories = [
  { id: "restaurantes", label: "Restaurantes" },
  { id: "bares", label: "Bares" },
  { id: "cafes", label: "Cafés e docerias" },
  { id: "cultura", label: "Museus e cultura" },
  { id: "shows", label: "Shows e música" },
  { id: "festas", label: "Festas e baladas" },
  { id: "feiras", label: "Feiras e mercados" },
  { id: "exposicoes", label: "Exposições" },
  { id: "teatro", label: "Teatro e dança" },
  { id: "ar-livre", label: "Parques e ar livre" },
  { id: "esportes", label: "Esportes" },
  { id: "passeios", label: "Passeios e turismo" },
  { id: "compras", label: "Compras" },
  { id: "infantil", label: "Para crianças" },
] as const;

export type CategoryId = (typeof categories)[number]["id"];

export const categoryIds = categories.map((c) => c.id) as [CategoryId, ...CategoryId[]];

export function isCategoryId(value: string): value is CategoryId {
  return (categoryIds as string[]).includes(value);
}
