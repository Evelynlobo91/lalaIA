import { formatShortCode } from "@/shared/kernel/short-code";

/** Código da recompensa em destaque, para mostrar no balcão. */
export function RewardCode({ code, note }: { code: string; note?: string }) {
  const formatted = formatShortCode(code);
  return (
    <div role="status" className="flex flex-col gap-1 rounded-xl border border-dashed border-brand bg-surface-2 px-4 py-3">
      <span className="text-sm text-muted">Seu código</span>
      <span className="font-mono text-2xl font-bold tracking-widest" aria-label={`Código ${formatted.split("").join(" ")}`}>
        {formatted}
      </span>
      {note && <span className="text-sm text-muted">{note}</span>}
    </div>
  );
}
