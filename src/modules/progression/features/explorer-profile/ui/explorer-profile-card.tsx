import { Compass } from "lucide-react";
import { Badge, Card, CardDescription, CardTitle } from "@/shared/ui";
import type { ExplorerProfile } from "../explorer-profile.use-case";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Seção do perfil: o que a pessoa já descobriu (contagens, categorias e bairros). Só ela vê. */
export function ExplorerProfileCard({ profile }: { profile: ExplorerProfile }) {
  const stats = [
    { label: plural(profile.placesDiscovered, "Lugar descoberto", "Lugares descobertos"), value: profile.placesDiscovered },
    { label: plural(profile.placesVisited, "Lugar visitado", "Lugares visitados"), value: profile.placesVisited },
    { label: plural(profile.eventsFavorited, "Evento favoritado", "Eventos favoritados"), value: profile.eventsFavorited },
    { label: plural(profile.missionsCompleted, "Missão concluída", "Missões concluídas"), value: profile.missionsCompleted },
    { label: plural(profile.checkIns, "Check-in", "Check-ins"), value: profile.checkIns },
    { label: plural(profile.neighborhoods.length, "Bairro explorado", "Bairros explorados"), value: profile.neighborhoods.length },
  ];
  const empty = profile.placesDiscovered === 0 && profile.eventsFavorited === 0 && profile.missionsCompleted === 0;

  return (
    <Card className="flex flex-col gap-4" aria-labelledby="explorador-titulo">
      <CardTitle id="explorador-titulo" className="flex items-center gap-2">
        <Compass aria-hidden className="size-5 text-brand" /> Seu perfil de explorador
      </CardTitle>
      {empty && <CardDescription>Favorite lugares e eventos ou conclua missões para começar a contar suas descobertas.</CardDescription>}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col-reverse rounded-xl bg-surface-2 p-3">
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="text-2xl font-bold">{s.value}</dd>
          </div>
        ))}
      </dl>
      {profile.categories.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="explorador-categorias">
          <h4 id="explorador-categorias" className="text-sm font-semibold text-muted">
            Por categoria
          </h4>
          <ul className="flex flex-col divide-y divide-border" aria-label="Descobertas por categoria">
            {profile.categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span>{c.label}</span>
                <Badge variant="brand" aria-label={`${c.count} ${plural(c.count, "descoberta", "descobertas")}`}>
                  {c.count}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
      {profile.neighborhoods.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="explorador-bairros">
          <h4 id="explorador-bairros" className="text-sm font-semibold text-muted">
            Bairros explorados
          </h4>
          <ul className="flex flex-wrap gap-2" aria-label="Bairros explorados">
            {profile.neighborhoods.map((n) => (
              <li key={n}>
                <Badge>{n}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  );
}
