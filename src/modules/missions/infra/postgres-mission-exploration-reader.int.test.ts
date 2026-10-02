import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { PostgresMissionExplorationReader } from "./postgres-mission-exploration-reader";
import { PostgresMissionRepository } from "./postgres-mission-repository";
import { PostgresStepCompletionRepository } from "./postgres-step-completion-repository";
import { PostgresUserMissionRepository } from "./postgres-user-mission-repository";

const db = sql();
const reader = new PostgresMissionExplorationReader(db);
const parceiro = crypto.randomUUID();
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
const cafe = crypto.randomUUID();
const museu = crypto.randomUUID();

beforeAll(async () => {
  for (const id of [parceiro, ana, bia]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`ex-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${parceiro}, 'partner')`;
  const missions = new PostgresMissionRepository(db);
  const draft = (title: string, places: string[]) => ({
    title,
    description: "Missão do teste de exploração.",
    xp: 90,
    startsAt: new Date(Date.now() - 86_400_000),
    endsAt: new Date(Date.now() + 86_400_000),
    steps: places.map((placeId, i) => ({ title: `Etapa ${i + 1}`, placeId, validation: "qr" as const })),
  });
  // Duas missões que passam pelo mesmo café: o lugar conta uma vez só.
  const rota = await missions.create(parceiro, draft("Rota", [cafe, museu]));
  const outra = await missions.create(parceiro, draft("Outra", [cafe, museu]));
  const userMissions = new PostgresUserMissionRepository(db);
  const completions = new PostgresStepCompletionRepository(db);
  const anaRota = await userMissions.accept(ana, rota.id);
  const anaOutra = await userMissions.accept(ana, outra.id);
  await completions.complete(ana, anaRota.id, rota.steps[0].id);
  await completions.complete(ana, anaRota.id, rota.steps[1].id);
  await completions.complete(ana, anaOutra.id, outra.steps[0].id);
});

afterAll(async () => {
  await db`delete from auth.users where id in (${parceiro}, ${ana}, ${bia})`;
  await db.end();
});

describe("PostgresMissionExplorationReader", () => {
  it("missões concluídas, check-ins e lugares visitados sem repetição", async () => {
    const result = await reader.explorationOf(ana);
    expect(result.completedMissions).toBe(1);
    expect(result.checkIns).toBe(3);
    expect(result.visitedPlaceIds.sort()).toEqual([cafe, museu].sort());
  });

  it("cada pessoa só vê a própria exploração (RLS)", async () => {
    expect(await reader.explorationOf(bia)).toEqual({ completedMissions: 0, checkIns: 0, visitedPlaceIds: [] });
  });
});
