"use client";

import { Search as SearchIcon } from "lucide-react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, cn } from "@/shared/ui";
import { useDebouncedValue } from "@/shared/ui/debounce";
import { MIN_QUERY_LENGTH, toQueryString } from "../search-url";

const DEBOUNCE_MS = 300;

type SearchBoxProps = {
  defaultValue?: string | null;
  /** Outros parâmetros da URL que a busca mantém (tipo, filtros). */
  keep?: Record<string, string>;
  /** Em /buscar: atualiza os resultados enquanto a pessoa digita (com debounce). Fora dela, só ao enviar. */
  live?: boolean;
  className?: string;
};

/**
 * Campo de busca. Sem JavaScript é um formulário GET para /buscar; com JavaScript, em /buscar, atualiza
 * a URL 300 ms depois da última tecla (sem uma requisição por letra) e mantém o foco no campo.
 */
export function SearchBox({ defaultValue, keep = {}, live = false, className }: SearchBoxProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(defaultValue ?? "");
  const debounced = useDebouncedValue(text, DEBOUNCE_MS);
  const lastSent = useRef((defaultValue ?? "").trim());
  const keepQuery = toQueryString(keep);

  useEffect(() => {
    if (!live) return;
    const q = debounced.trim();
    if (q === lastSent.current || (q.length > 0 && q.length < MIN_QUERY_LENGTH)) return;
    lastSent.current = q;
    const params = new URLSearchParams(keepQuery);
    if (q) params.set("q", q);
    startTransition(() => router.replace(`/buscar?${params}`, { scroll: false }));
  }, [debounced, live, keepQuery, router]);

  return (
    <Form
      action="/buscar"
      role="search"
      onSubmit={() => {
        lastSent.current = text.trim();
      }}
      className={cn("flex items-center gap-2", className)}
    >
      <label htmlFor="busca" className="sr-only">
        Buscar lugares e eventos
      </label>
      <div className="relative flex-1">
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
        <input
          id="busca"
          type="search"
          name="q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={80}
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Restaurante, samba, museu..."
          aria-busy={pending || undefined}
          className="h-12 w-full rounded-xl border border-border bg-surface pr-4 pl-12 text-base text-fg placeholder:text-muted"
        />
      </div>
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" size="lg" loading={pending}>
        Buscar
      </Button>
    </Form>
  );
}
