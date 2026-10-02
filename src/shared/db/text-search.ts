import type postgres from "postgres";
import type { Sql } from "./sql";
import { searchTerms } from "../text/search-terms";

/**
 * Busca textual em português, sem acento e por prefixo (configurações `platform.busca` e
 * `platform.busca_simples`, migration platform__busca_textual).
 *
 * `document` deve ser a MESMA expressão de texto do índice GIN da tabela, por exemplo:
 *   create index ... using gin ((to_tsvector('platform.busca', name) || to_tsvector('platform.busca_simples', name)))
 * → `textMatch(sql, sql\`name\`, texto)`.
 *
 * Cada termo vira prefixo nas duas configurações (radical OU palavra inteira), e todos os termos precisam
 * casar. Devolve `null` quando o texto não tem nenhum termo (só pontuação).
 */
export function textMatch(sql: Sql, document: postgres.Fragment, text: string) {
  const terms = searchTerms(text);
  if (terms.length === 0) return null;
  // Os termos só têm letras e números (searchTerms), então ":*" não abre brecha de sintaxe no to_tsquery.
  const query = terms
    .map((t) => sql`(to_tsquery('platform.busca', ${`${t}:*`}) || to_tsquery('platform.busca_simples', ${`${t}:*`}))`)
    .reduce((acc, q) => sql`${acc} && ${q}`);
  return sql`(to_tsvector('platform.busca', ${document}) || to_tsvector('platform.busca_simples', ${document})) @@ (${query})`;
}
