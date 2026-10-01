import { Target } from "lucide-react";
import type { Metadata } from "next";
import { getCurrentUser } from "@/modules/identity";
import { AcceptMissionButton, MissionCardView, availableMissions, myMissions, type MyMission } from "@/modules/missions";
import { Badge, ButtonLink, EmptyState, FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "Missões", description: "Missões urbanas para explorar Joinville e ganhar XP." };
// Depende do momento (janela de validade) e de quem está logado.
export const dynamic = "force-dynamic";

export default async function MissoesPage({ searchParams }: PageProps<"/missoes">) {
  const { aceita } = await searchParams;
  const user = await getCurrentUser();
  const [available, mine] = await Promise.all([availableMissions(), user ? myMissions(user.id) : Promise.resolve([] as MyMission[])]);
  const accepted = new Set(mine.map((m) => m.id));
  const active = mine.filter((m) => m.userMission.status === "active");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">Missões</h1>
        <p className="text-muted">Explore Joinville, complete etapas nos lugares parceiros e ganhe XP.</p>
      </header>
      {aceita && <FormAlert variant="success">Missão aceita! Boa exploração.</FormAlert>}

      {active.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Suas missões ativas">
          <h2 className="text-lg font-semibold">Suas missões ativas</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {active.map((m) => (
              <li key={m.id}>
                <MissionCardView mission={m} badge={<Badge variant="accent">Em andamento</Badge>} />
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
