// Termos de busca digitados pela pessoa → formatos seguros para o banco e para comparação em memória.

const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 40;

/** "Açaí" → "acai": sem acento e em minúsculas (para comparar em memória). */
export function foldAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

/**
 * Palavras da busca (letras e números, em qualquer idioma). Pontuação e operadores somem,
 * então o resultado pode ir para `to_tsquery` sem risco de sintaxe injetada.
 */
export function searchTerms(text: string): string[] {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_TERMS).map((t) => t.slice(0, MAX_TERM_LENGTH));
}
