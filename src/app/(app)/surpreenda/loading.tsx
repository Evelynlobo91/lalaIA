import { Sparkles } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center" aria-busy="true" role="status">
      <Sparkles aria-hidden className="size-8 animate-pulse text-brand" />
      <p className="text-lg font-semibold">Montando seu roteiro…</p>
      <p className="text-sm text-muted">Vendo o que está rolando agora em Joinville.</p>
    </div>
  );
}
