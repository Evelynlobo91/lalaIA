import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventCounts } from "@/modules/events";
import { userCounts } from "@/modules/identity";
import { liveCounts } from "@/modules/live";
import { missionCompletionCounts } from "@/modules/missions";
import { partnerCounts } from "@/modules/partners";
import { sql } from "@/shared/db/sql";

const db = sql();
const owner = crypto.randomUUID();
const explorer = crypto.randomUUID();
// Janela isolada no futuro: nenhum outro dado de teste cai nela, então as contagens são exatas.
const from = new Date("2037-03-01T00:00:00Z");
const to = new Date("2037-03-08T00:00:00Z");
const inside = new Date("2037-03-03T12:00:00Z");
const outside = new Date("2037-03-09T12:00:00Z");

beforeAll(async () => {
  for (const id of [owner, explorer]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`pm-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  // Usuários: um perfil criado dentro da janela, outro fora.
  await db`update identity.profiles set created_at = ${inside} where user_id = ${owner}`;
  await db`update identity.profiles set created_at = ${outside} where user_id = ${explorer}`;

  // Parceiro aprovado dentro da janela.
  await db`insert into partners.partners (owner_id, kind, business_name, phone, description, status, reviewed_at)
           values (${owner}, 'estabelecimento', 'Bar das Métricas', '47999990000', 'Bar de teste das métricas gerais.', 'approved', ${inside})`;

  // Eventos: um criado dentro, um fora.
  const event = (createdAt: Date) =>
    db`insert into events.events (owner_id, place_id, title, description, category, starts_at, ends_at, created_at)
       values (${owner}, ${crypto.randomUUID()}, 'Evento das métricas', 'Evento de teste das métricas.', 'shows', ${outside}, ${new Date(outside.getTime() + 3_600_000)}, ${createdAt})`;
  await event(inside);
  await event(outside);

  // Missão concluída dentro da janela.
  const [mission] = await db<{ id: string }[]>`
    insert into missions.missions (owner_id, title, description, xp, starts_at, ends_at)
    values (${owner}, 'Missão das métricas', 'Missão de teste das métricas.', 50, ${from}, ${outside}) returning id`;
  await db`insert into missions.user_missions (user_id, mission_id, status, accepted_at, completed_at) values (${explorer}, ${mission.id}, 'completed', ${from}, ${inside})`;

  // Live: uma transmissão que entrou no ar duas vezes na janela (conta uma vez).
  const [stream] = await db<{ id: string }[]>`
    insert into live.streams (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id)
    values (${owner}, 'place', ${crypto.randomUUID()}, 'fake', ${`pm-${owner}`}, ${`pb-${owner}`}) returning id`;
  for (const minutes of [0, 30]) {
    await db`insert into live.stream_lifecycle_events (stream_id, source, kind, provider_event_id, status_after, occurred_at)
             values (${stream.id}, 'provider', 'active', ${`pm-${owner}-${minutes}`}, 'live', ${new Date(inside.getTime() + minutes * 60_000)})`;
  }
});

afterAll(async () => {
  await db`delete from auth.users where id in (${owner}, ${explorer})`;
  await db.end();
});

describe("contagens por módulo das métricas gerais (#145)", () => {
  it("cada módulo conta só o que aconteceu dentro do período", async () => {
    expect(await userCounts().between(from, to)).toBe(1);
    expect(await partnerCounts().between(from, to)).toBe(1);
    expect(await eventCounts().between(from, to)).toBe(1);
    expect(await missionCompletionCounts().between(from, to)).toBe(1);
    expect(await liveCounts().between(from, to)).toBe(1);
  });

  it("o fim do período é exclusivo e um período sem nada dá zero", async () => {
    const empty = [new Date("2037-02-01T00:00:00Z"), new Date("2037-02-08T00:00:00Z")] as const;
    expect(await eventCounts().between(...empty)).toBe(0);
    expect(await userCounts().between(...empty)).toBe(0);
    expect(await eventCounts().between(from, inside)).toBe(0);
    expect(await eventCounts().between(inside, to)).toBe(1);
  });

  it("totais: usuários existentes e parceiros ativos (suspenso não conta como ativo)", async () => {
    const users = await userCounts().total();
    const active = await partnerCounts().total();
    expect(users).toBeGreaterThanOrEqual(2);
    expect(active).toBeGreaterThanOrEqual(1);

    await db`update partners.partners set status = 'suspended', suspension_reason = 'Teste das métricas.' where owner_id = ${owner}`;
    expect(await partnerCounts().total()).toBe(active - 1);
    // Aprovado no período continua contando, mesmo suspenso depois.
    expect(await partnerCounts().between(from, to)).toBe(1);
  });
});
