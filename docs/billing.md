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

## Webhooks de pagamento e inadimplência (#154)

- **`POST /api/billing/webhooks`:** recebe os eventos do provedor (pago, vencido, estornado). A assinatura é conferida
  sobre o corpo cru, em tempo constante e com janela de 5 minutos; sem assinatura válida responde 401. Corpo acima de
  64 KB responde 413. Sem o segredo configurado a rota responde 503.
- **Idempotência e log:** cada evento é gravado em `billing.payment_events` (append-only) com o id do provedor;
  reenvio do mesmo evento não tem efeito. Cobrança desconhecida é registrada e respondida com 200, para o provedor
  não reenviar. O log guarda só ids e o tipo do evento.
- **O que cada evento faz:**
  - **pago:** fatura paga; o plano da fatura passa a valer (primeira assinatura, troca pendente ou renovação), a
    assinatura fica em dia e o ciclo é o da fatura.
  - **vencido:** fatura vencida; quem estava em dia entra na **carência** (`past_due`), e o plano continua valendo.
  - **estornado:** fatura estornada; a assinatura é suspensa na hora.
- **Ciclo diário** (`POST /api/billing/cycle`, depois da renovação): marca como vencidas as faturas que passaram do
  vencimento (caso o provedor não avise) e **suspende** quem continua sem pagar depois da carência
  (`BILLING_GRACE_DAYS`, padrão 5 dias).
- **Suspensa:** volta a valer o plano padrão. O módulo publica `billing.SubscriptionSuspended`; a live assina esse
  evento e, se o plano que sobrou não libera a live, encerra as transmissões do dono. O pagamento reativa a
  assinatura sozinho (`billing.SubscriptionReactivated`); o parceiro ativa a live de novo no portal.
- **Simulador de pagamento:** com o provedor simulado e `BILLING_FAKE_WEBHOOK_SECRET` (mínimo de 32 caracteres), a
  página `/pagamento/simulado/<id>` mostra "Simular pagamento", que entrega ao app o mesmo webhook assinado que o
  provedor entregaria. Só o dono da cobrança consegue simular o próprio pagamento.

## Tela de assinatura do parceiro (#155)

`/parceiro/assinatura` reúne:

- **Plano atual:** o plano que vale agora, a situação da assinatura, a próxima renovação e, se houver, o plano que
  aguarda pagamento. Fatura vencida e suspensão aparecem com um aviso do que fazer.
- **Planos:** upgrade (plano mais caro: gera fatura e vale depois do pagamento) e downgrade (para o gratuito vale na
  hora; para outro plano pago, depois do pagamento).
- **Faturas:** as 24 mais recentes, com plano, valor, vencimento ou data do pagamento e a situação. Fatura em aberto
  tem o link **Pagar**; vencida, **Segunda via** (o mesmo link de pagamento do provedor).
- A assinatura e as faturas são lidas como o próprio parceiro (`asUser`): a RLS garante que uma conta não vê as
  faturas de outra, mesmo que a consulta esquecesse o filtro por dono.
