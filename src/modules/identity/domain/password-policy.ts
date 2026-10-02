// Política de senha (RNF04). Espelha o supabase/config.toml (minimum_password_length = 8,
// password_requirements = "letters_digits"); a validação aqui dá feedback antes da chamada.
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignora o que passa de 72 bytes: acima disso a senha seria silenciosamente truncada.
export const PASSWORD_MAX_BYTES = 72;

export type PasswordRule = { id: "min_length" | "letter" | "digit" | "max_length"; label: string; test: (password: string) => boolean };

export const passwordRules: PasswordRule[] = [
  { id: "min_length", label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { id: "letter", label: "Pelo menos uma letra", test: (p) => /\p{L}/u.test(p) },
  { id: "digit", label: "Pelo menos um número", test: (p) => /\d/.test(p) },
  { id: "max_length", label: `No máximo ${PASSWORD_MAX_BYTES} caracteres`, test: (p) => new TextEncoder().encode(p).length <= PASSWORD_MAX_BYTES },
];

export function failedPasswordRules(password: string): PasswordRule[] {
  return passwordRules.filter((rule) => !rule.test(password));
}
