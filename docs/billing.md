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
