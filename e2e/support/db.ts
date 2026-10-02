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
