import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button, cn } from "@/shared/ui";
import { contentHref, contentTabs, type ContentTab } from "../content-tabs";

/** Abas (lugares, eventos, missões) e busca por nome de /admin/conteudo. Funciona sem JavaScript (links + GET). */
export function ContentSearch({ tab, text }: { tab: ContentTab; text: string }) {
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Tipo de conteúdo">
        <ul className="flex flex-wrap gap-2">
          {contentTabs.map(({ id, label }) => (
            <li key={id}>
              <Link
                href={contentHref(id, text)}
                aria-current={id === tab ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
                  id === tab ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface text-fg hover:border-brand",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Form action="/admin/conteudo" className="flex gap-2" role="search">
        <input type="hidden" name="tipo" value={tab} />
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">
          Buscar por nome
          <input
            type="search"
            name="q"
            defaultValue={text}
            maxLength={80}
            className="min-h-11 rounded-xl border border-border bg-surface px-3 text-base font-normal"
          />
        </label>
        <Button type="submit" variant="secondary" className="self-end">
          <Search aria-hidden className="size-4" /> Buscar
        </Button>
      </Form>
    </div>
  );
}
