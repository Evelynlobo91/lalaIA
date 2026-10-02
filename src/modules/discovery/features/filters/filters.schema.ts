import { z } from "zod";
import { dateFilterLabels, dateFilterParam, dateFilterValue } from "@/modules/events";
import { categories, categoryIds } from "@/shared/catalog/categories";
import { priceRanges, priceRangeValues } from "../../domain/price-ranges";
import { timeOfDayLabels, timeOfDayValues } from "../../domain/time-of-day";

/** Parâmetros de filtro na URL (compartilhável), na ordem em que aparecem. */
export const filterParams = ["categoria", "bairro", "quando", "horario", "preco"] as const;
export type FilterParam = (typeof filterParams)[number];

/** Campos de filtro (RF05). Combinam com a busca (`q`) e com o tipo (`tipo`). */
export const filtersShape = {
  categoria: z.enum(categoryIds, "Categoria inválida.").optional(),
  bairro: z
    .string()
    .trim()
    .max(120, "Bairro inválido.")
    .optional()
    .transform((v) => v || undefined),
  // Mesmo formato do filtro de data de /eventos: hoje | amanha | fim-de-semana | AAAA-MM-DD.
  quando: dateFilterParam,
  horario: z.enum(timeOfDayValues, "Horário inválido.").optional(),
  preco: z.enum(priceRangeValues, "Faixa de preço inválida.").optional(),
};

export const filtersSchema = z.object(filtersShape);
export type FiltersInput = z.infer<typeof filtersSchema>;

/**
 * Normaliza a URL antes de validar: campos vazios (formulário enviado sem JavaScript) são ignorados e
 * o campo de data específica (`data`) vira o filtro `quando`.
 */
export function normalizeFilterParams(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const values = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ""));
  if (typeof values.data === "string") values.quando = values.data;
  delete values.data;
  return values;
}

export function hasFilters(f: Partial<FiltersInput>): boolean {
  return Boolean(f.categoria || f.bairro || f.quando || f.horario || f.preco);
}

/** Filtros ativos de volta para a URL. */
export function filtersToParams(f: Partial<FiltersInput>): Partial<Record<FilterParam, string>> {
  const params: Partial<Record<FilterParam, string>> = {};
  if (f.categoria) params.categoria = f.categoria;
  if (f.bairro) params.bairro = f.bairro;
  if (f.quando) params.quando = dateFilterValue(f.quando);
  if (f.horario) params.horario = f.horario;
  if (f.preco) params.preco = f.preco;
  return params;
}

const categoryLabels = new Map<string, string>(categories.map((c) => [c.id, c.label]));
const dateLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });

/** Rótulo de cada filtro ativo, para os chips "remover filtro". */
export function describeFilters(f: Partial<FiltersInput>): Array<{ param: FilterParam; label: string }> {
  const out: Array<{ param: FilterParam; label: string }> = [];
  if (f.categoria) out.push({ param: "categoria", label: categoryLabels.get(f.categoria) ?? f.categoria });
  if (f.bairro) out.push({ param: "bairro", label: f.bairro });
  if (f.quando) {
    const label = f.quando.kind === "data" ? `Em ${dateLabel.format(new Date(`${f.quando.date}T12:00:00Z`))}` : dateFilterLabels[f.quando.kind];
    out.push({ param: "quando", label });
  }
  if (f.horario) out.push({ param: "horario", label: timeOfDayLabels[f.horario] });
  if (f.preco) out.push({ param: "preco", label: priceRanges[f.preco].label });
  return out;
}
