import { Target } from "lucide-react";
import type { Metadata } from "next";
import { getCurrentUser } from "@/modules/identity";
import {
  AcceptMissionButton,
  MissionCardView,
  SurpriseFinder,
  SurpriseOfferCard,
  availableMissions,
  myMissions,
  openSurpriseOffers,
  type MyMission,
  type SurpriseTeaser,
} from "@/modules/missions";
import { NearMeButton } from "@/modules/places";
import { MissionRecommendations, constraintsSummary, missionRecommendations } from "@/modules/recommendation";
import { Badge, ButtonLink, EmptyState, FormAlert } from "@/shared/ui";

/** Leva as restrições efetivas (e a localização) para /sugestoes, onde dá para ajustar em chips. */
function sugestoesHref(state: { tempo: number; orcamento: number | null; pessoas: number; origin: { lat: number; lon: number } | null }) {
  const query = new URLSearchParams({ tempo: String(state.tempo), orcamento: state.orcamento === null ? "sem" : String(state.orcamento), pessoas: String(state.pessoas) });
  if (state.origin) {
    query.set("lat", String(state.origin.lat));
    query.set("lon", String(state.origin.lon));
  }
  return `/sugestoes?${query.toString()}`;
}

export const metadata: Metadata = { title: "Missões", description: "Missões urbanas para explorar Joinville e ganhar XP." };
// Depende do momento (janela de validade) e de quem está logado.
export const dynamic = "force-dynamic";

export default async function MissoesPage({ searchParams }: PageProps<"/missoes">) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const [recommended, available, mine, surprises] = await Promise.all([
    missionRecommendations(params),
    availableMissions(),
    user ? myMissions(user.id) : Promise.resolve([] as MyMission[]),
    user ? openSurpriseOffers(user.id) : Promise.resolve([] as SurpriseTeaser[]),
  ]);
  const accepted = new Set(mine.map((m) => m.id));
  const active = mine.filter((m) => m.userMission.status === "active");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">Missões</h1>
        <p className="text-muted">Explore Joinville, complete etapas nos lugares parceiros e ganhe XP.</p>
      </header>

      {recommended.invalid && <FormAlert>{recommended.invalid} Mostrando com os padrões do seu perfil.</FormAlert>}
      <MissionRecommendations items={recommended.items} summary={constraintsSummary(recommended.state)} />
      <div className="flex flex-wrap items-start gap-3">
        {!recommended.state.origin && <NearMeButton target="/missoes" label="Missões perto de mim" />}
        <ButtonLink href={sugestoesHref(recommended.state)} variant="ghost">
          Ajustar tempo e orçamento
        </ButtonLink>
      </div>

      {user && (
        <section className="flex flex-col gap-3" aria-label="Missão surpresa">
          <h2 className="text-lg font-semibold">Missão surpresa</h2>
          {surprises.length > 0 ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {surprises.map((offer) => (
                <li key={offer.missionId}>
                  <SurpriseOfferCard offer={offer} />
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className="text-sm text-muted">Está passeando por Joinville? Procure uma missão inesperada perto de você. Ela vale por pouco tempo!</p>
              <SurpriseFinder />
            </>
          )}
        </section>
      )}

      {active.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Suas missões ativas">
          <h2 className="text-lg font-semibold">Suas missões ativas</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {active.map((m) => (
              <li key={m.id}>
                <MissionCardView mission={m} badge={<Badge variant="accent">{m.progress.percent}% concluída</Badge>} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-label="Missões disponíveis">
        <h2 className="text-lg font-semibold">Disponíveis</h2>
        {available.length === 0 ? (
          <EmptyState icon={Target} title="Nenhuma missão disponível agora" description="Novas missões aparecem aqui quando os parceiros publicam. Volte em breve!" />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {available.map((m) => (
              <li key={m.id}>
                <MissionCardView
                  mission={m}
                  footer={
                    !user ? (
                      <ButtonLink href="/entrar?next=/missoes" variant="secondary" className="self-start">
                        Entre para aceitar
                      </ButtonLink>
                    ) : accepted.has(m.id) ? (
                      <Badge variant="success" className="self-start">
                        Aceita
                      </Badge>
                    ) : (
                      <AcceptMissionButton missionId={m.id} title={m.title} />
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
