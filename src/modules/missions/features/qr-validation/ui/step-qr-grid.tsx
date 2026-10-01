import { formatDateTime, formatTime } from "@/shared/time/joinville-time";
import { Card } from "@/shared/ui";
import type { MissionQrCodes } from "../step-qr-codes.use-case";

/**
 * QR de cada etapa. O SVG é gerado no servidor pela lib `qrcode` a partir da URL assinada
 * (sem texto do usuário dentro), por isso pode ser inserido como HTML.
 */
export function StepQrGrid({ codes }: { codes: MissionQrCodes }) {
  const until = codes.mode === "print" ? formatDateTime(codes.expiresAt) : formatTime(codes.expiresAt);
  return (
    <ul className="grid gap-4 sm:grid-cols-2 print:grid-cols-2" aria-label="QR codes das etapas">
      {codes.steps.map((s) => (
        <li key={s.stepId} className="break-inside-avoid">
          <Card className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted">Etapa {s.position}</p>
            <h2 className="text-lg font-bold">{s.title}</h2>
            <p className="text-sm">{s.placeName}</p>
            <div
              role="img"
              aria-label={`QR code da etapa ${s.position}: ${s.title}`}
              data-qr-url={s.url}
              className="w-full max-w-64 rounded-xl bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: s.svg }}
            />
            <p className="text-sm text-muted">Vale até {until}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}
