// Teste de carga da audiência de uma live (#56): simula N espectadores com a página aberta, cada um fazendo o
// que a tela faz — status a cada 12 s, chat a cada 2,5 s e pulso a cada 5 s — e mede latência e erros.
// Mede a APLICAÇÃO e o BANCO. O vídeo em si sai do CDN do provedor (Mux) e não passa por aqui.
//
// Uso:
//   npm run load:live -- --setup                      cria uma live de teste no banco (DATABASE_URL) e roda
//   npm run load:live -- --stream <id> --entity <id>  usa uma live que já existe
// Opções: --base http://localhost:3000  --viewers 200  --seconds 60  --keep (não apaga a live de teste)
//
// Nunca rode com --setup contra o banco de produção: ele cria (e apaga) uma conta e uma transmissão de teste.
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const base = option("base", "http://localhost:3000").replace(/\/$/, "");
const viewers = Number(option("viewers", "200"));
const seconds = Number(option("seconds", "60"));
if (!Number.isInteger(viewers) || viewers < 1 || viewers > 5000 || !(seconds >= 5 && seconds <= 900)) {
  console.error("Use --viewers entre 1 e 5000 e --seconds entre 5 e 900.");
  process.exit(1);
}

let streamId = option("stream");
let entityId = option("entity");
let cleanup = async () => {};

if (flag("setup")) {
  if (!process.env.DATABASE_URL) {
    console.error("--setup precisa de DATABASE_URL (veja .env.example).");
    process.exit(1);
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const owner = randomUUID();
  entityId = randomUUID();
  await sql`insert into auth.users (id, email, raw_user_meta_data) values (${owner}, ${`carga-${owner}@lalaia.test`}, ${sql.json({ terms_version: "2026-09", display_name: "Teste de carga" })})`;
  await sql`insert into identity.user_roles (user_id, role) values (${owner}, 'partner')`;
  // Plano com chat, para o chat e o pulso responderem de verdade (sem o recurso, as rotas respondem vazio).
  await sql`insert into billing.subscriptions (owner_id, plan_id, status, current_period_start, current_period_end)
            select ${owner}, id, 'active', now() - interval '1 day', now() + interval '29 days' from billing.plans where code = 'pro'`;
  [{ id: streamId }] = await sql`
    insert into live.streams (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id, signal)
    values (${owner}, 'place', ${entityId}, 'fake', ${`carga-${randomUUID()}`}, ${`carga-${randomUUID()}`}, 'live') returning id`;
  for (let i = 0; i < 50; i++) {
    await sql`insert into live.chat_messages (stream_id, user_id, body, is_host) values (${streamId}, ${owner}, ${`Mensagem de teste ${i + 1}`}, true)`;
  }
  cleanup = async () => {
    if (!flag("keep")) await sql`delete from auth.users where id = ${owner}`;
    await sql.end();
  };
  console.log(`Live de teste criada: stream ${streamId}, entidade ${entityId}`);
}

if (!streamId || !entityId) {
  console.error("Informe --stream <id> e --entity <id>, ou use --setup.");
  process.exit(1);
}

const endpoints = {
  status: { every: 12_000, call: () => fetch(`${base}/api/live/status?entityType=place&entityId=${entityId}`) },
  chat: { every: 2_500, call: (v) => fetch(`${base}/api/live/chat?streamId=${streamId}${v.version ? `&version=${encodeURIComponent(v.version)}` : ""}`) },
  pulse: {
    every: 5_000,
    call: (v) => fetch(`${base}/api/live/pulse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ streamId, viewerId: v.id }) }),
  },
};

const stats = Object.fromEntries(Object.keys(endpoints).map((name) => [name, { latencies: [], errors: 0, statuses: {} }]));
const deadline = Date.now() + seconds * 1000;
let lastPulse = null;

async function hit(name, viewer) {
  const started = performance.now();
  try {
    const response = await endpoints[name].call(viewer);
    const body = await response.json().catch(() => null);
    stats[name].latencies.push(performance.now() - started);
    stats[name].statuses[response.status] = (stats[name].statuses[response.status] ?? 0) + 1;
    if (!response.ok) stats[name].errors++;
    else if (name === "chat" && body?.version) viewer.version = body.version;
    else if (name === "pulse" && body) lastPulse = body;
  } catch {
    stats[name].errors++;
  }
}

async function loop(name, viewer) {
  // Cada espectador começa num ponto diferente do ciclo, como abas abertas em momentos diferentes.
  await new Promise((r) => setTimeout(r, Math.random() * endpoints[name].every));
  while (Date.now() < deadline) {
    const started = Date.now();
    await hit(name, viewer);
    const wait = endpoints[name].every - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, Math.max(0, deadline - Date.now()))));
  }
}

console.log(`${viewers} espectadores por ${seconds} s em ${base} ...`);
const startedAt = Date.now();
const audience = Array.from({ length: viewers }, () => ({ id: randomUUID().replaceAll("-", ""), version: undefined }));
await Promise.all(audience.flatMap((viewer) => Object.keys(endpoints).map((name) => loop(name, viewer))));
const elapsed = (Date.now() - startedAt) / 1000;

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
let total = 0;
let failed = 0;
console.log("\nrota     req     req/s   erros   p50 ms   p95 ms   p99 ms   max ms   status");
for (const [name, s] of Object.entries(stats)) {
  const sorted = s.latencies.sort((a, b) => a - b);
  const count = sorted.length + (s.errors - Object.entries(s.statuses).filter(([code]) => Number(code) >= 400).reduce((n, [, c]) => n + c, 0));
  total += count;
  failed += s.errors;
  const cols = [name.padEnd(8), String(count).padStart(6), (count / elapsed).toFixed(1).padStart(8), String(s.errors).padStart(7)];
  for (const p of [50, 95, 99]) cols.push(pct(sorted, p).toFixed(0).padStart(8));
  cols.push((sorted.at(-1) ?? 0).toFixed(0).padStart(8), "  " + JSON.stringify(s.statuses));
  console.log(cols.join(" "));
}
console.log(`\ntotal: ${total} requisições em ${elapsed.toFixed(0)} s (${(total / elapsed).toFixed(1)} req/s), ${failed} com erro (${((failed / Math.max(1, total)) * 100).toFixed(2)}%).`);
if (lastPulse) console.log(`último pulso: ${lastPulse.viewers} espectadores contados pela plataforma.`);

await cleanup();
process.exit(failed / Math.max(1, total) > 0.01 ? 1 : 0);
