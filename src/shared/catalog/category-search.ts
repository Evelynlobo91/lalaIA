import { foldAccents, searchTerms } from "../text/search-terms";
import { categories, type CategoryId } from "./categories";

const labelWords = categories.map((c) => ({ id: c.id, words: searchTerms(foldAccents(`${c.label} ${c.id}`)) }));

/**
 * Categorias cujo nome combina com a busca: TODOS os termos são início de alguma palavra do nome
 * ("bares" → Bares; "museu" → Museus e cultura). "bar do zé" não vira "todos os bares", porque "zé" não casa.
 */
export function categoriesMatching(text: string): CategoryId[] {
  const terms = searchTerms(foldAccents(text));
  if (terms.length === 0) return [];
  return labelWords.filter(({ words }) => terms.every((t) => words.some((w) => w.startsWith(t)))).map((c) => c.id);
}
