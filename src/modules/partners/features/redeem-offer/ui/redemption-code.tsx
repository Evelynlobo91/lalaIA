/** Código de resgate em destaque, para mostrar no balcão. */
export function RedemptionCode({ code, note = "Mostre este código no balcão. Ele também fica em “Meus resgates”, no seu perfil." }: { code: string; note?: string }) {
  return (
    <div role="status" className="flex flex-col gap-1 rounded-xl border border-dashed border-brand bg-surface-2 px-4 py-3">
      <span className="text-sm text-muted">Seu código</span>
      <span className="font-mono text-2xl font-bold tracking-widest" aria-label={`Código ${code.split("").join(" ")}`}>
        {code}
      </span>
      {note && <span className="text-sm text-muted">{note}</span>}
    </div>
  );
}
