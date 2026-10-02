import postgres from "postgres";

/**
 * Roda uma vez ao fim dos testes E2E: apaga os dados criados pelos testes no banco LOCAL, para que
 * execuções seguintes não fiquem mais lentas nem instáveis com dados acumulados (listas e clusters no mapa).
 * - Contas de teste (`e2e-...@lalaia.test`) → em cascata: perfis, papéis, parceiros, eventos, pedidos de vínculo.
 * - Lugares criados pelos testes (`source_id` começando com `e2e/`).
 */
export default async function globalTeardown() {
  const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1 });
  try {
    // Interações dos lugares e eventos de teste (sem FK entre schemas: apaga antes das entidades).
    await sql`delete from analytics.events where entity_id in (
      select id from places.places where source = 'osm' and source_id like 'e2e/%'
      union all
      select e.id from events.events e join auth.users u on u.id = e.owner_id where u.email like 'e2e-%@lalaia.test'
      union all
      select s.id from live.streams s join auth.users u on u.id = s.owner_id where u.email like 'e2e-%@lalaia.test')`;
    await sql`delete from places.places where source = 'osm' and source_id like 'e2e/%'`;
    // Estabelecimentos cadastrados por admins de teste no backoffice (#143); antes das contas, senão `created_by` vira null.
    await sql`delete from places.places where source = 'admin' and created_by in (select id from auth.users where email like 'e2e-%@lalaia.test')`;
    // Leads cadastrados por contas de teste (#147); antes das contas, senão `created_by` vira null e eles ficam.
    await sql`delete from crm.leads where created_by in (select id from auth.users where email like 'e2e-%@lalaia.test')`;
    await sql`delete from auth.users where email like 'e2e-%@lalaia.test'`;
  } catch (error) {
    // Limpeza é melhor-esforço: não pode transformar uma execução verde em vermelha.
    console.warn("Limpeza dos dados de teste falhou:", error instanceof Error ? error.message : error);
  } finally {
    await sql.end();
  }
}
