import postgres from "postgres";
import type { TestUser } from "./users";

// Acesso direto ao banco LOCAL de testes (para preparar cenários, ex.: conceder papéis).
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

export function grantRole(user: Pick<TestUser, "email">, role: "partner" | "admin") {
  return withDb(
    (sql) => sql`insert into identity.user_roles (user_id, role)
                 select id, ${role} from auth.users where lower(email) = ${user.email.toLowerCase()}
                 on conflict do nothing`,
  );
}

/**
 * Lugar exclusivo do teste (nome único). Por padrão fica no centro de Joinville; passe `at` para um ponto
 * isolado quando o teste depender do mapa (vários lugares no mesmo ponto viram um cluster).
 */
export function createTestPlace(name: string, at: { lat: number; lon: number } = { lat: -26.3045, lon: -48.8456 }, category = "cafes"): Promise<string> {
  return withDb(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      insert into places.places (source, source_id, name, category, opening_hours, location)
      values ('osm', ${`e2e/${name}`}, ${name}, ${category}, 'Mo-Fr 08:00-18:00', extensions.st_makepoint(${at.lon}, ${at.lat})::extensions.geography)
      returning id`;
    return row.id;
  });
}

/** Ponto aleatório numa área sem lugares do OpenStreetMap (zona rural ao norte de Joinville). */
export function isolatedPoint() {
  return { lat: -26.12 - Math.random() * 0.03, lon: -48.95 - Math.random() * 0.03 };
}

/** Evento de teste com horários relativos a agora (em horas). Devolve o id. */
export function createTestEvent(opts: {
  ownerEmail: string;
  placeId: string;
  title: string;
  startsInHours: number;
  durationHours: number;
  category?: string;
  priceCents?: number;
  cancelled?: boolean;
}): Promise<string> {
  return withDb(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      insert into events.events (owner_id, place_id, title, description, category, starts_at, ends_at, price_cents, status, cancelled_at)
      select id, ${opts.placeId}, ${opts.title}, 'Evento criado pelos testes automatizados.', ${opts.category ?? "shows"},
             now() + make_interval(mins => ${Math.round(opts.startsInHours * 60)}),
             now() + make_interval(mins => ${Math.round((opts.startsInHours + opts.durationHours) * 60)}),
             ${opts.priceCents ?? 0}, ${opts.cancelled ? "cancelled" : "scheduled"}, ${opts.cancelled ? new Date() : null}
      from auth.users where lower(email) = ${opts.ownerEmail.toLowerCase()}
      returning id`;
    return row.id;
  });
}

/** Missão de teste já publicada (janela relativa a agora, em horas). Devolve o id da missão e das etapas, em ordem. */
export function createTestMission(opts: {
  ownerEmail: string;
  title: string;
  xp?: number;
  /** `validation` (#61): "qr" (padrão), "gps" ou "qr_gps"; com GPS, raio (m) e permanência (min). */
  steps: Array<{ title: string; placeId: string; validation?: "qr" | "gps" | "qr_gps"; radiusMeters?: number; dwellMinutes?: number }>;
  startsInHours?: number;
  endsInHours?: number;
  /** Missão surpresa (#63): fora da lista, oferecida por proximidade. */
  surprise?: boolean;
}): Promise<{ missionId: string; stepIds: string[] }> {
  return withDb((sql) =>
    sql.begin(async (tx) => {
      const [mission] = await tx<{ id: string }[]>`
        insert into missions.missions (owner_id, title, description, xp, starts_at, ends_at, surprise)
        select id, ${opts.title}, 'Missão criada pelos testes automatizados.', ${opts.xp ?? 100},
               now() + make_interval(mins => ${Math.round((opts.startsInHours ?? -1) * 60)}),
               now() + make_interval(mins => ${Math.round((opts.endsInHours ?? 72) * 60)}),
               ${opts.surprise ?? false}
        from auth.users where lower(email) = ${opts.ownerEmail.toLowerCase()}
        returning id`;
      const stepIds: string[] = [];
      for (const [i, step] of opts.steps.entries()) {
        const validation = step.validation ?? "qr";
        const radius = validation === "qr" ? null : (step.radiusMeters ?? 100);
        const dwell = validation === "qr" ? null : validation === "qr_gps" ? 0 : (step.dwellMinutes ?? 0);
        const [row] = await tx<{ id: string }[]>`
          insert into missions.mission_steps (mission_id, position, title, place_id, validation, geofence_radius_m, dwell_minutes)
          values (${mission.id}, ${i + 1}, ${step.title}, ${step.placeId}, ${validation}, ${radius}, ${dwell}) returning id`;
        stepIds.push(row.id);
      }
      return { missionId: mission.id, stepIds };
    }),
  );
}

/** Torna o usuário responsável pelo lugar (como se o vínculo tivesse sido aprovado). */
export function assignPlaceTo(user: Pick<TestUser, "email">, placeId: string) {
  return withDb(
    (sql) => sql`update places.places set managed_by = (select id from auth.users where lower(email) = ${user.email.toLowerCase()}) where id = ${placeId}`,
  );
}

/** Parceiro já aprovado (cadastro + papel), para testes do portal. */
export async function createApprovedPartner(user: Pick<TestUser, "email">, businessName = "Bar do Teste") {
  await withDb(
    (sql) => sql`insert into partners.partners (owner_id, kind, business_name, phone, description, status, reviewed_at)
                 select id, 'estabelecimento', ${businessName}, '47999990000', 'Bar de teste com música ao vivo em Joinville.', 'approved', now()
                 from auth.users where lower(email) = ${user.email.toLowerCase()}
                 on conflict (owner_id) do update set status = 'approved', business_name = excluded.business_name`,
  );
  await grantRole(user, "partner");
}

/** Favorito direto no banco (ex.: eventos, enquanto a página de detalhe do evento não tem o botão). */
export function addFavorite(user: Pick<TestUser, "email">, entityType: "place" | "event", entityId: string) {
  return withDb(
    (sql) => sql`insert into favorites.favorites (user_id, entity_type, entity_id)
                 select id, ${entityType}, ${entityId} from auth.users where lower(email) = ${user.email.toLowerCase()}
                 on conflict do nothing`,
  );
}

/** Transmissão ao vivo de um lugar/evento (módulo live), ou null se ainda não foi gerada. */
export function liveStreamOf(entityId: string): Promise<{ id: string; providerStreamId: string; status: string; streamKey: string } | null> {
  return withDb(async (sql) => {
    const [row] = await sql<{ id: string; provider_stream_id: string; status: string; stream_key: string }[]>`
      select s.id, s.provider_stream_id, s.status, c.stream_key
      from live.streams s join live.stream_credentials c on c.stream_id = s.id
      where s.entity_id = ${entityId}`;
    return row ? { id: row.id, providerStreamId: row.provider_stream_id, status: row.status, streamKey: row.stream_key } : null;
  });
}

/** Transmissão simulada (provedor fake) já vinculada a um lugar/evento, como se o dono tivesse gerado a chave. */
export function createLiveStream(owner: Pick<TestUser, "email">, entityType: "place" | "event", entityId: string): Promise<{ id: string; providerStreamId: string }> {
  return withDb((sql) =>
    sql.begin(async (tx) => {
      const providerStreamId = `fake-${crypto.randomUUID()}`;
      const [row] = await tx<{ id: string; owner_id: string }[]>`
        insert into live.streams (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id)
        select id, ${entityType}, ${entityId}, 'fake', ${providerStreamId}, ${providerStreamId}
        from auth.users where lower(email) = ${owner.email.toLowerCase()}
        returning id, owner_id`;
      await tx`insert into live.stream_credentials (stream_id, owner_id, stream_key) values (${row.id}, ${row.owner_id}, ${`chave-e2e-${crypto.randomUUID()}`})`;
      return { id: row.id, providerStreamId };
    }),
  );
}

/** Registra o aceite das diretrizes de privacidade da Live (#55), como se o parceiro tivesse marcado o checklist. */
export function acceptLiveGuidelines(user: Pick<TestUser, "email">, version = "2026-10") {
  return withDb(
    (sql) => sql`
      insert into live.broadcaster_agreements (owner_id, guidelines_version)
      select id, ${version} from auth.users where lower(email) = ${user.email.toLowerCase()}
      on conflict (owner_id) do update set guidelines_version = excluded.guidelines_version, privacy_ack_at = now()`,
  );
}

/** Muda o controle da transmissão direto no banco (como se o dono tivesse pausado/encerrado no portal). */
export function setLiveControl(streamId: string, control: "on" | "paused" | "ended") {
  return withDb((sql) => sql`update live.streams set control = ${control} where id = ${streamId}`);
}

/** Quantos eventos de ciclo de vida a transmissão tem (log append-only do módulo live). */
export function lifecycleCount(streamId: string): Promise<number> {
  return withDb(async (sql) => {
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from live.stream_lifecycle_events where stream_id = ${streamId}`;
    return row.n;
  });
}

/** Interações registradas pelo Analytics para uma entidade (contagem por tipo). */
export function interactionCounts(entityId: string): Promise<Record<string, number>> {
  return withDb(async (sql) => {
    const rows = await sql<{ kind: string; total: number }[]>`
      select kind, count(*)::int as total from analytics.events where entity_id = ${entityId} group by kind`;
    return Object.fromEntries(rows.map((r) => [r.kind, r.total]));
  });
}

/** Interações de teste direto no Analytics (ex.: N visualizações de um lugar hoje). */
export function recordInteractions(entityType: "place" | "event" | "mission" | "live", entityId: string, kind: string, count: number) {
  return withDb(
    (sql) => sql`
      insert into analytics.events (kind, entity_type, entity_id, source)
      select ${kind}, ${entityType}, ${entityId}, 'ui' from generate_series(1, ${count})`,
  );
}

/**
 * Crédito de XP direto no livro-razão (progression), como se viesse de uma etapa de missão.
 * Não publica eventos: serve para testar o que é derivado do saldo (ex.: nível).
 */
export function creditTestXp(user: Pick<TestUser, "email">, amount: number, description = "Etapa concluída · Teste E2E") {
  return withDb(
    (sql) => sql`
      insert into progression.xp_transactions (user_id, amount, reason, source_id, description, event_id)
      select id, ${amount}, 'mission_step', gen_random_uuid(), ${description}, gen_random_uuid()
      from auth.users where lower(email) = ${user.email.toLowerCase()}`,
  );
}

/** Desbloqueia uma conquista direto no banco (sem bônus de XP). Devolve o id do desbloqueio (link de compartilhar). */
export function unlockTestAchievement(user: Pick<TestUser, "email">, achievementId: string): Promise<string> {
  return withDb(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      insert into progression.achievements (user_id, achievement_id)
      select id, ${achievementId} from auth.users where lower(email) = ${user.email.toLowerCase()}
      returning id`;
    return row.id;
  });
}
