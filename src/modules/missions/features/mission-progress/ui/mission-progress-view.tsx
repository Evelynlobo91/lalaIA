import { CalendarClock, CheckCircle2, Circle, CircleDot, LocateFixed, MapPin, QrCode, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, Card, cn } from "@/shared/ui";
import { GEOFENCE_RADIUS_METERS } from "../../../domain/geofence";
import type { StepState } from "../../../domain/progress";
import { GeofenceCheckInButton } from "../../geofence-validation/ui/geofence-check-in-button";
import type { MissionProgressView, StepProgressView } from "../mission-progress.use-case";

const stateLabel: Record<StepState, string> = { done: "Concluída", next: "Próxima", pending: "Pendente" };

/** Tela da missão (RF29): etapas com status, percentual e o lugar de cada etapa. `action` recebe o botão de aceitar. */
export function MissionProgressPanel({ view, action }: { view: MissionProgressView; action?: ReactNode }) {
  const { mission, userMission, progress, xp } = view;
  const completed = userMission?.status === "completed";
  // Check-in por GPS (#61): só quem está jogando a missão, dentro do prazo, na próxima etapa.
  const canCheckIn = userMission?.status === "active" && mission.available;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">{mission.xp} XP</Badge>
          {mission.surprise && (
            <Badge variant="accent">
              <Sparkles aria-hidden className="size-3.5" /> Missão surpresa
            </Badge>
          )}
          {completed ? <Badge variant="success">Missão concluída</Badge> : userMission ? <Badge variant="accent">Em andamento</Badge> : null}
          {!mission.available && !completed && <Badge variant="danger">Fora do prazo</Badge>}
        </div>
        <h1 className="text-2xl font-bold md:text-3xl">{mission.title}</h1>
        <p>{mission.description}</p>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarClock aria-hidden className="size-4 shrink-0" /> Até {formatDateTime(mission.endsAt)}
        </p>
        <p className="text-sm text-muted">
          {xp.perStep} XP por etapa + {xp.completionBonus} XP de bônus ao concluir a missão.
        </p>
      </header>

      {userMission ? (
        <Card className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span id="progresso-rotulo" className="font-semibold">
              Progresso
            </span>
            <span className="text-sm text-muted">
              {progress.done} de {progress.total} {progress.total === 1 ? "etapa" : "etapas"} · <strong className="text-fg">{progress.percent}%</strong>
            </span>
          </div>
          <div
            role="progressbar"
            aria-labelledby="progresso-rotulo"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-valuetext={`${progress.percent}% concluído`}
            className="h-3 overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress.percent}%` }} />
          </div>
        </Card>
      ) : (
        action
      )}

      <section className="flex flex-col gap-3" aria-label="Etapas">
        <h2 className="text-lg font-semibold">Etapas</h2>
        <ol className="flex flex-col gap-3">
          {view.steps.map((step) => (
            <li key={step.id}>
              <Card className={cn("flex gap-3", step.state === "next" && "border-brand")}>
                <StepIcon state={step.state} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">
                      {step.position}. {step.title}
                    </h3>
                    {userMission && <Badge variant={step.state === "done" ? "success" : step.state === "next" ? "accent" : "neutral"}>{stateLabel[step.state]}</Badge>}
                  </div>
                  {step.hidden ? (
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                      <Sparkles aria-hidden className="size-4 shrink-0" /> {userMission ? "Revelada quando chegar a vez dela." : "Revelada depois do aceite."}
                    </span>
                  ) : step.place ? (
                    <Link href={`/lugares/${step.place.id}`} className="flex items-center gap-1.5 text-sm font-medium text-brand underline">
                      <MapPin aria-hidden className="size-4 shrink-0" />
                      {step.place.name}
                      {step.place.neighborhood ? ` · ${step.place.neighborhood}` : ""}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted">Lugar indisponível</span>
                  )}
                  {step.hidden ? null : step.completedAt ? (
                    <span className="text-sm text-muted">Concluída em {formatDateTime(step.completedAt)}</span>
                  ) : (
                    <StepHint step={step} />
                  )}
                  {canCheckIn && !step.hidden && step.state === "next" && step.validation === "gps" && (
                    <div className="mt-2">
                      <GeofenceCheckInButton stepId={step.id} radiusMeters={step.geofence?.radiusMeters ?? GEOFENCE_RADIUS_METERS.default} />
                    </div>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function StepHint({ step }: { step: StepProgressView }) {
  const className = "flex items-center gap-1.5 text-sm text-muted";
  if (step.validation === "gps") {
    const g = step.geofence;
    return (
      <span className={className}>
        <LocateFixed aria-hidden className="size-4 shrink-0" />
        Check-in por GPS no lugar{g ? ` (até ${g.radiusMeters} m${g.dwellMinutes ? `, fique ${g.dwellMinutes} min` : ""})` : ""}.
      </span>
    );
  }
  if (step.validation === "qr_gps") {
    return (
      <span className={className}>
        <QrCode aria-hidden className="size-4 shrink-0" /> Escaneie o QR code no balcão e confirme sua localização.
      </span>
    );
  }
  return (
    <span className={className}>
      <QrCode aria-hidden className="size-4 shrink-0" /> Escaneie o QR code no balcão do lugar.
    </span>
  );
}

function StepIcon({ state }: { state: StepState }) {
  const className = "mt-0.5 size-6 shrink-0";
  if (state === "done") return <CheckCircle2 aria-hidden className={cn(className, "text-success")} />;
  if (state === "next") return <CircleDot aria-hidden className={cn(className, "text-brand")} />;
  return <Circle aria-hidden className={cn(className, "text-muted")} />;
}
