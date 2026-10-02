import { z } from "zod";
import { fromLocalInput } from "@/shared/time/joinville-time";
import { CTA_LIMITS as L, CTA_SCHEDULE_KINDS, CTA_TYPES, type CtaPriority, type CtaSchedule, type CtaType } from "../../domain/cta";

/** O que o parceiro define; o destino do toque é resolvido pelo tipo no caso de uso. */
export type CtaDraft = {
  type: CtaType;
  refId: string | null;
  url: string | null;
  title: string;
  body: string | null;
  buttonLabel: string;
  priority: CtaPriority;
  schedule: CtaSchedule;
};

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim());

/** Minutos digitados no formulário ("" → falta; "abc" → inválido). */
function minutes(raw: string, range: { min: number; max: number }, path: string, label: string, ctx: z.RefinementCtx): number | null {
  const n = /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
  if (Number.isNaN(n) || n < range.min || n > range.max) {
    ctx.addIssue({ code: "custom", path: [path], message: `${label}: de ${range.min} a ${range.max} minutos.` });
    return null;
  }
  return n;
}

export const ctaSchema = z
  .object({
    streamId: z.uuid(),
    ctaId: z.uuid().optional(),
    type: z.enum(CTA_TYPES, { error: "Escolha o tipo." }),
    refId: optionalText,
    url: optionalText,
    title: z.string().trim().min(L.title.min, "Dê um título curto (ex.: Chope em dobro até 21h).").max(L.title.max, `Use no máximo ${L.title.max} caracteres.`),
    body: z.string().trim().max(L.body.max, `Use no máximo ${L.body.max} caracteres.`).optional(),
    buttonLabel: z.string().trim().min(L.buttonLabel.min, "Escreva o texto do botão.").max(L.buttonLabel.max, `Use no máximo ${L.buttonLabel.max} caracteres.`),
    priority: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2), z.literal(3)], { error: "Escolha a prioridade." })),
    scheduleKind: z.enum(CTA_SCHEDULE_KINDS, { error: "Escolha quando aparece." }),
    startsAt: optionalText,
    endsAt: optionalText,
    offsetMinutes: optionalText,
    durationMinutes: optionalText,
    intervalMinutes: optionalText,
  })
  .transform((v, ctx): { streamId: string; ctaId: string | undefined; draft: CtaDraft } => {
    let schedule: CtaSchedule | null = null;
    if (v.scheduleKind === "absolute") {
      const startsAt = fromLocalInput(v.startsAt);
      const endsAt = fromLocalInput(v.endsAt);
      if (!startsAt) ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Informe quando começa." });
      if (!endsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Informe quando termina." });
      if (startsAt && endsAt) {
        if (endsAt <= startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O fim precisa ser depois do início." });
        else if (endsAt.getTime() - startsAt.getTime() > L.absoluteHours * 3_600_000) ctx.addIssue({ code: "custom", path: ["endsAt"], message: `Pode ficar no ar por no máximo ${L.absoluteHours} horas.` });
        else schedule = { kind: "absolute", startsAt, endsAt };
      }
    } else {
      const durationMinutes = minutes(v.durationMinutes, L.durationMinutes, "durationMinutes", "Duração", ctx);
      if (v.scheduleKind === "relative") {
        const offsetMinutes = minutes(v.offsetMinutes, L.offsetMinutes, "offsetMinutes", "Espera", ctx);
        if (offsetMinutes !== null && durationMinutes !== null) schedule = { kind: "relative", offsetMinutes, durationMinutes };
      } else {
        const intervalMinutes = minutes(v.intervalMinutes, L.intervalMinutes, "intervalMinutes", "Intervalo", ctx);
        if (intervalMinutes !== null && durationMinutes !== null) {
          if (durationMinutes >= intervalMinutes) ctx.addIssue({ code: "custom", path: ["durationMinutes"], message: "A duração precisa ser menor que o intervalo." });
          else schedule = { kind: "recurring", intervalMinutes, durationMinutes };
        }
      }
    }
    const refId = z.uuid().safeParse(v.refId);
    if (v.refId && !refId.success) ctx.addIssue({ code: "custom", path: ["refId"], message: "Escolha uma opção da lista." });
    if (!schedule) return z.NEVER;
    return {
      streamId: v.streamId,
      ctaId: v.ctaId,
      draft: {
        type: v.type,
        refId: refId.success ? refId.data.toLowerCase() : null,
        url: v.url || null,
        title: v.title,
        body: v.body ? v.body : null,
        buttonLabel: v.buttonLabel,
        priority: v.priority,
        schedule,
      },
    };
  });

export const ctaIdSchema = z.object({ ctaId: z.uuid() });
