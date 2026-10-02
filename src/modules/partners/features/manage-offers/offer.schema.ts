import { z } from "zod";
import { fromLocalInput } from "@/shared/time/joinville-time";
import { MAX_OFFER_REDEMPTIONS, offerTargetTypes, type OfferDraft, type OfferTargetType } from "../../domain/offer";

const MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000;
const TARGET = /^(place|event):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const localDateTime = (label: string) =>
  z.string().transform((value, ctx) => {
    const date = fromLocalInput(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: `Informe ${label}.` });
      return z.NEVER;
    }
    return date;
  });

/** "place:<id>" ou "event:<id>" (valor do seletor de lugar/evento). */
const target = z.string({ error: "Escolha onde vale a oferta." }).transform((value, ctx) => {
  const m = TARGET.exec(value);
  if (!m || !offerTargetTypes.includes(m[1] as OfferTargetType)) {
    ctx.addIssue({ code: "custom", message: "Escolha onde vale a oferta." });
    return z.NEVER;
  }
  return { type: m[1] as OfferTargetType, id: m[2].toLowerCase() };
});

/** Campo opcional: vazio = sem limite. */
const limit = z
  .number({ error: "Use um número." })
  .int("Use um número inteiro.")
  .min(1, "O limite mínimo é 1 resgate.")
  .max(MAX_OFFER_REDEMPTIONS, `O limite máximo é ${MAX_OFFER_REDEMPTIONS.toLocaleString("pt-BR")} resgates.`);

const maxRedemptions = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim())
  .pipe(z.union([z.literal("").transform(() => null), z.string().transform(Number).pipe(limit)]));

export const offerSchema = z
  .object({
    offerId: z.uuid().optional(),
    target,
    title: z.string().trim().min(3, "Dê um título à oferta (ex.: 10% no café).").max(80, "Use no máximo 80 caracteres."),
    description: z.string().trim().min(10, "Explique a oferta e as regras (pelo menos 10 caracteres).").max(500, "Use no máximo 500 caracteres."),
    startsAt: localDateTime("quando a oferta começa"),
    endsAt: localDateTime("quando a oferta termina"),
    maxRedemptions,
  })
  .superRefine((v, ctx) => {
    if (v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O fim precisa ser depois do início." });
    else if (v.endsAt.getTime() - v.startsAt.getTime() > MAX_WINDOW_MS) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "A oferta pode durar no máximo 1 ano." });
  })
  .transform(({ offerId, ...draft }): { offerId: string | undefined; draft: OfferDraft } => ({ offerId, draft }));

export const offerIdSchema = z.object({ offerId: z.uuid() });
