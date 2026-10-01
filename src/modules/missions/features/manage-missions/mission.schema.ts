import { z } from "zod";
import { fromLocalInput } from "@/shared/time/joinville-time";
import { MAX_STEPS, MAX_XP, MIN_XP, validationKinds, type StepDraft } from "../../domain/mission";

const MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const localDateTime = (label: string) =>
  z.string().transform((value, ctx) => {
    const date = fromLocalInput(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: `Informe ${label}.` });
      return z.NEVER;
    }
    return date;
  });

const stepInput = z.object({
  title: z.string().trim().max(200).catch(""),
  placeId: z.string().catch(""),
  validation: z.enum(validationKinds).catch("qr"),
});

/**
 * Etapas chegam como JSON num campo oculto (o editor de etapas é dinâmico). As mensagens dizem
 * qual etapa corrigir, porque todas aparecem juntas no campo "steps".
 */
const steps = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Etapas inválidas." });
      return z.NEVER;
    }
  })
  .pipe(z.array(stepInput, { error: "Etapas inválidas." }).min(1, "Adicione pelo menos uma etapa.").max(MAX_STEPS, `Use no máximo ${MAX_STEPS} etapas.`))
  .superRefine((list, ctx) => {
    list.forEach((step, i) => {
      if (step.title.length < 3 || step.title.length > 80) ctx.addIssue({ code: "custom", message: `Etapa ${i + 1}: diga o que fazer (3 a 80 caracteres).` });
      if (!UUID.test(step.placeId)) ctx.addIssue({ code: "custom", message: `Etapa ${i + 1}: escolha o lugar.` });
    });
  })
  .transform((list): StepDraft[] => list);

export const missionSchema = z
  .object({
    missionId: z.uuid().optional(),
    title: z.string().trim().min(3, "Dê um título à missão.").max(120),
    description: z.string().trim().min(10, "Descreva a missão (pelo menos 10 caracteres).").max(2000),
    xp: z.coerce
      .number({ error: "Informe o XP." })
      .int("Use um número inteiro.")
      .min(MIN_XP, `O XP mínimo é ${MIN_XP}.`)
      .max(MAX_XP, `O XP máximo é ${MAX_XP}.`),
    startsAt: localDateTime("quando a missão começa"),
    endsAt: localDateTime("quando a missão termina"),
    steps,
  })
  .superRefine((v, ctx) => {
    if (v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O fim precisa ser depois do início." });
    else if (v.endsAt.getTime() - v.startsAt.getTime() > MAX_WINDOW_MS) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "A missão pode durar no máximo 1 ano." });
  })
  .transform(({ missionId, ...draft }) => ({ missionId, draft }));

export type MissionInput = z.infer<typeof missionSchema>;
