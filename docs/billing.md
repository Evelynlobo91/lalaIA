# Cobrança (`billing`)

Planos, assinaturas e faturas dos parceiros (Epic #86). As telas do time ficam em `/admin/financeiro`.

## Planos e direitos por plano (#152)

- **Plano:** código, nome, descrição, mensalidade e os **recursos que libera**. O catálogo de recursos fica em
  `domain/plan.ts`: `live`, `missoes`, `ofertas`, `destaque`, `cta` e `chat`.
- **Plano padrão:** vale para o parceiro que não tem assinatura. Sempre existe exatamente um, e ele precisa estar
  ativo. Marcar outro plano como padrão tira o padrão do anterior na mesma transação.
- **Planos iniciais** (criados pela migration; o time ajusta no backoffice):
  - **Básico** (padrão, gratuito): live, missões e ofertas, ou seja, tudo o que já existia. Nada muda para os
    parceiros atuais.
  - **Pro** (R$ 149,00/mês): o Básico mais destaque, CTAs e chat nas lives.

  Os preços e a divisão dos recursos são uma proposta e precisam ser validados.
- **`PlanEntitlements`:** os outros módulos perguntam "este parceiro tem direito a X?" por `hasPlanFeature(ownerId,
  recurso)`, na API pública do módulo, sem conhecer as tabelas de cobrança.
  - **Live** já consulta: gerar a chave e ativar exigem o recurso `live` no plano do dono, além do aceite das
    diretrizes de privacidade. Pausar e encerrar continuam livres.
  - Enquanto não há assinaturas (#153), todo parceiro está no plano padrão.
- **Acesso por capacidade (#157):** `billing:read` para ver e `billing:write` para criar e editar (Financeiro e Admin),
  na página, na action e na RLS de `billing.plans`.

## Assinatura e faturas (#153)

- **Assinar** em `/parceiro/assinatura`: o parceiro vê os planos ativos, qual vale agora e assina outro.
  - Plano gratuito vale na hora.
  - Plano pago gera a primeira fatura (vencimento em 3 dias) com o link de pagamento. **O plano só passa a valer
    quando o pagamento for confirmado** (#154); até lá continua valendo o plano anterior (ou o padrão).
  - Trocar de plano com a assinatura em dia deixa a troca **pendente** (`pending_plan_id`) até o pagamento.
  - Escolher de novo o mesmo plano não gera outra cobrança: devolve a fatura em aberto.
- **Situações da assinatura:** `pending` (aguardando o primeiro pagamento), `active`, `past_due` (vencida, na
  carência), `suspended` e `cancelled`. O plano assinado vale em `active` e `past_due`; nas outras, vale o padrão.
- **Ciclo mensal:** `POST /api/billing/cycle` emite a fatura do próximo ciclo das assinaturas em dia que vencem nos
  próximos 5 dias. É idempotente por ciclo. Chame uma vez por dia (ex.: Vercel Cron) com
  `Authorization: Bearer <CRON_SECRET>`; sem `CRON_SECRET` (mínimo de 32 caracteres) a rota responde 503 e não roda.
- **Provedor de pagamento:** os casos de uso dependem da porta `BillingGateway`. Hoje só existe o adaptador
  **simulado** (`fake`), que não cobra ninguém: o link leva a `/pagamento/simulado/<id>`. O provedor real (Asaas,
  Mercado Pago ou Stripe) é uma decisão pendente e entra como um novo adaptador, escolhido por `BILLING_PROVIDER`.
- **Quem grava:** assinaturas e faturas são escritas pelo sistema (a autorização fica nos casos de uso). A RLS só
  libera leitura: o dono lê a própria assinatura e faturas, e o financeiro lê todas.
