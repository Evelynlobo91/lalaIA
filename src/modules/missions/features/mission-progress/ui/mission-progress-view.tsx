import { CalendarClock, CheckCircle2, Circle, CircleDot, MapPin, QrCode } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, Card, cn } from "@/shared/ui";
import type { StepState } from "../../../domain/progress";
import type { MissionProgressView } from "../mission-progress.use-case";

const stateLabel: Record<StepState, string> = { done: "Concluída", next: "Próxima", pending: "Pendente" };

/** Tela da missão (RF29): etapas com status, percentual e o lugar de cada etapa. `action` recebe o botão de aceitar. */
export function MissionProgressPanel({ view, action }: { view: MissionProgressView; action?: ReactNode }) {
  const { mission, userMission, progress, xp } = view;
  const completed = userMission?.status === "completed";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">{mission.xp} XP</Badge>
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
                  {step.place ? (
                    <Link href={`/lugares/${step.place.id}`} className="flex items-center gap-1.5 text-sm font-medium text-brand underline">
                      <MapPin aria-hidden className="size-4 shrink-0" />
                      {step.place.name}
                      {step.place.neighborhood ? ` · ${step.place.neighborhood}` : ""}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted">Lugar indisponível</span>
                  )}
                  {step.completedAt ? (
                    <span className="text-sm text-muted">Concluída em {formatDateTime(step.completedAt)}</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                      <QrCode aria-hidden className="size-4 shrink-0" /> Escaneie o QR code no balcão do lugar.
                    </span>
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

function StepIcon({ state }: { state: StepState }) {
  const className = "mt-0.5 size-6 shrink-0";
  if (state === "done") return <CheckCircle2 aria-hidden className={cn(className, "text-success")} />;
  if (state === "next") return <CircleDot aria-hidden className={cn(className, "text-brand")} />;
  return <Circle aria-hidden className={cn(className, "text-muted")} />;
}
