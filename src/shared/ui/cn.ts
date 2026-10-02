import { twMerge } from "tailwind-merge";

/**
 * Junta classes CSS ignorando valores falsos e resolvendo conflitos do Tailwind
 * (a última vence): cn("bg-surface p-4", "bg-brand") → "p-4 bg-brand".
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
