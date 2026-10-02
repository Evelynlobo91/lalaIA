// Código curto para mostrar no balcão (resgates de ofertas e recompensas de missão): legível em voz alta e
// sem caracteres ambíguos (sem 0/O, 1/I/L). 31 símbolos ^ 8 posições ≈ 8,5 × 10^11 combinações.

export const SHORT_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const SHORT_CODE_LENGTH = 8;

const VALID = new RegExp(`^[${SHORT_CODE_ALPHABET}]{${SHORT_CODE_LENGTH}}$`);

/** Sorteio uniforme (rejeição de bytes ≥ 248 para não favorecer símbolos). */
export function generateShortCode(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const limit = 256 - (256 % SHORT_CODE_ALPHABET.length);
  let code = "";
  while (code.length < SHORT_CODE_LENGTH) {
    for (const byte of random(new Uint8Array(SHORT_CODE_LENGTH * 2))) {
      if (byte < limit && code.length < SHORT_CODE_LENGTH) code += SHORT_CODE_ALPHABET[byte % SHORT_CODE_ALPHABET.length];
    }
  }
  return code;
}

/** "abcd-efgh" / " ABCD EFGH " → "ABCDEFGH"; null se não puder ser um código. */
export function normalizeShortCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return VALID.test(code) ? code : null;
}

/** "ABCDEFGH" → "ABCD-EFGH" (mais fácil de ditar). */
export function formatShortCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
