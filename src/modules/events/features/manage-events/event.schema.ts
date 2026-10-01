import { z } from "zod";
import { categoryIds } from "@/shared/catalog/categories";
import { fromLocalInput } from "@/shared/time/joinville-time";

const MAX_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

const localDateTime = (label: string) =>
  z.string().transform((value, ctx) => {
    const date = fromLocalInput(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: `Informe ${label}.` });
      return z.NEVER;
    }
    return date;
  });

// "25", "25,50", "R$ 25,50" → 2550 centavos; vazio ou 0 = gratuito.
const price = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return 0;
    const normalized = value.replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      ctx.addIssue({ code: "custom", message: "Informe o valor em reais (ex.: 25 ou 25,50). Deixe vazio se for gratuito." });
      return z.NEVER;
    }
    return Math.round(Number(normalized) * 100);
  })
  .pipe(z.number().int().min(0).max(10_000_000, "Valor alto demais."));

export const eventSchema = z
  .object({
    eventId: z.uuid().optional(),
    placeId: z.uuid({ error: "Escolha o lugar do evento." }),
    title: z.string().trim().min(3, "Dê um título ao evento.").max(120),
    description: z.string().trim().min(10, "Descreva o evento (pelo menos 10 caracteres).").max(2000),
    category: z.enum(categoryIds, { error: "Escolha uma categoria." }),
    startsAt: localDateTime("a data e hora de início"),
    endsAt: localDateTime("a data e hora de término"),
    price,
  })
  .superRefine((v, ctx) => {
    if (v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O término precisa ser depois do início." });
    else if (v.endsAt.getTime() - v.startsAt.getTime() > MAX_DURATION_MS) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O evento pode durar no máximo 14 dias." });
  })
  .transform(({ eventId, price, ...draft }) => ({ eventId, draft: { ...draft, priceCents: price } }));

export type EventInput = z.infer<typeof eventSchema>;
