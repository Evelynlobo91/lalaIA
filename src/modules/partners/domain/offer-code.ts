// Código de resgate: curto, legível em voz alta e sem caracteres ambíguos (sem 0/O, 1/I/L).
// 31 símbolos ^ 8 posições ≈ 8,5 × 10^11 combinações: impraticável de adivinhar.

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 8;

const VALID = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Sorteio uniforme (rejeição de bytes ≥ 248 para não favorecer símbolos). */
export function generateOfferCode(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of random(new Uint8Array(CODE_LENGTH * 2))) {
      if (byte < limit && code.length < CODE_LENGTH) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return code;
}

/** "abcd-efgh" / " ABCD EFGH " → "ABCDEFGH"; null se não puder ser um código. */
export function normalizeOfferCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return VALID.test(code) ? code : null;
}

/** "ABCDEFGH" → "ABCD-EFGH" (mais fácil de ditar). */
export function formatOfferCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
