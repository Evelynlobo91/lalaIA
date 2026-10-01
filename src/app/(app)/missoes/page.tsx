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
import { Badge, ButtonLink, EmptyState } from "@/shared/ui";

export const metadata: Metadata = { title: "Missões", description: "Missões urbanas para explorar Joinville e ganhar XP." };
// Depende do momento (janela de validade) e de quem está logado.
export const dynamic = "force-dynamic";

export default async function MissoesPage() {
  const user = await getCurrentUser();
  const [available, mine, surprises] = await Promise.all([
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
