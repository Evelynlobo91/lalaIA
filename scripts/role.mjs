// Concede ou revoga papéis (partner/admin) por e-mail.
// Uso: npm run role -- grant admin voce@exemplo.com
//      npm run role -- revoke partner voce@exemplo.com
//      npm run role -- list voce@exemplo.com
// Lê DATABASE_URL do .env.local. Em produção, rode com a URL do banco de produção (acesso restrito).
import postgres from "postgres";

const [action, ...args] = process.argv.slice(2);
const ROLES = ["partner", "admin"];

function usage(message) {
  if (message) console.error(`Erro: ${message}\n`);
  console.error("Uso: npm run role -- grant|revoke <partner|admin> <email>\n     npm run role -- list <email>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) usage("DATABASE_URL não definida (veja .env.example).");
if (!["grant", "revoke", "list"].includes(action)) usage();

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const email = (action === "list" ? args[0] : args[1])?.trim().toLowerCase();
  if (!email) usage("informe o e-mail.");

  const [user] = await sql`select id from auth.users where lower(email) = ${email}`;
  if (!user) usage(`nenhuma conta com o e-mail ${email}.`);

  if (action !== "list") {
    const role = args[0];
    if (!ROLES.includes(role)) usage(`papel inválido: ${role}. Use partner ou admin.`);
    if (action === "grant") {
      await sql`insert into identity.user_roles (user_id, role) values (${user.id}, ${role}) on conflict do nothing`;
    } else {
      await sql`delete from identity.user_roles where user_id = ${user.id} and role = ${role}`;
    }
  }

  const rows = await sql`select role from identity.user_roles where user_id = ${user.id} order by role`;
  console.log(`${email}: ${rows.length ? rows.map((r) => r.role).join(", ") : "usuário comum (sem papéis extras)"}`);
} finally {
  await sql.end();
}
