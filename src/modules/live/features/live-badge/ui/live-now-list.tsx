import { CalendarDays, ChevronRight, MapPin, RadioTower } from "lucide-react";
import Link from "next/link";
import { formatTime } from "@/shared/time/joinville-time";
import { EmptyState, LiveBadge } from "@/shared/ui";
import type { LiveNowItem } from "../live-badge.use-case";

/** Lista "Com live agora" (RF20): lugares e eventos transmitindo, com link para a página do player. */
export function LiveNowList({ items }: { items: LiveNowItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={RadioTower}
        title="Nenhuma live no ar agora"
        description="Quando um bar, restaurante ou evento começar a transmitir, ele aparece aqui. Esta lista se atualiza ao recarregar."
      />
    );
  }
  return (
    <ul className="grid gap-4 md:grid-cols-2" aria-label="Com live agora">
      {items.map((item) => (
        <li key={item.streamId}>
          {/* Sem prefetch: o detalhe é dinâmico (evita uma consulta por card visível). Card escuro, como a tela de vídeo do protótipo. */}
          <Link
            href={item.href}
            prefetch={false}
            className="relative flex min-h-52 flex-col justify-end gap-2 overflow-hidden rounded-3xl bg-[#0b1220] p-5 text-white shadow-sm transition hover:-translate-y-0.5"
          >
            <span
              aria-hidden
              className="absolute inset-0 [background:radial-gradient(circle_at_80%_20%,rgb(200_30_30/0.45),transparent_45%),radial-gradient(circle_at_20%_30%,rgb(2_64_127/0.8),transparent_55%)]"
            />
            <RadioTower aria-hidden strokeWidth={1.25} className="absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 opacity-15" />
            <span className="absolute top-4 left-4 flex items-center gap-2">
              <LiveBadge />
              <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-xs font-medium">No ar desde {formatTime(item.liveSince)}</span>
            </span>
            <span className="relative inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-white/80">
              {item.entityType === "place" ? <MapPin aria-hidden className="size-3.5" /> : <CalendarDays aria-hidden className="size-3.5" />}
              {item.entityType === "place" ? "Lugar" : "Evento"}
              {item.subtitle ? ` · ${item.subtitle}` : ""}
            </span>
            <h2 className="relative text-xl leading-tight font-bold">{item.title}</h2>
            {item.whenLabel && <p className="relative text-sm text-white/85">{item.whenLabel}</p>}
            {item.note && (
              <p className="relative text-sm">
                <span className="font-semibold">Agora:</span> {item.note}
              </p>
            )}
            <ChevronRight aria-hidden className="absolute right-4 bottom-5 size-5 text-white/70" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
