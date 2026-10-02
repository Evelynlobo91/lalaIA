import { z } from "zod";

export const contentTabs = [
  { id: "lugares", label: "Lugares" },
  { id: "eventos", label: "Eventos" },
  { id: "missoes", label: "Missões" },
] as const;

export type ContentTab = (typeof contentTabs)[number]["id"];

const schema = z.object({
  tipo: z.enum(contentTabs.map((t) => t.id) as [ContentTab, ...ContentTab[]]).catch("lugares"),
  q: z.string().trim().max(80).catch(""),
});

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Aba e texto buscado em /admin/conteudo, a partir da URL. Valores inválidos caem no padrão (lugares, sem texto). */
export function contentQuery(params: Record<string, string | string[] | undefined>): { tab: ContentTab; text: string } {
  const { tipo, q } = schema.parse({ tipo: first(params.tipo) ?? "lugares", q: first(params.q) ?? "" });
  return { tab: tipo, text: q };
}

/** URL de /admin/conteudo para uma aba, mantendo o texto buscado. */
export function contentHref(tab: ContentTab, text = ""): string {
  const query = new URLSearchParams({ tipo: tab });
  if (text) query.set("q", text);
  return `/admin/conteudo?${query}`;
}

/** Para onde as actions de salvar voltam quando a edição veio do backoffice. */
export const CONTENT_RETURN = "admin";
