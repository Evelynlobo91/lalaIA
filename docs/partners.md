# Parceiros (estabelecimentos e promotores)

## Fluxo de cadastro (#26)

```
/parceiro  →  formulário  →  "Cadastro em análise"  →  admin em /admin/parceiros
                                                        ├─ Aprovar → papel `partner` concedido → portal liberado
                                                        └─ Recusar (motivo obrigatório) → pessoa vê o motivo, corrige e reenvia
```

- **Dados:** tipo (estabelecimento ou promotor), nome do negócio, telefone com DDD, Instagram
  (opcional, aceita `@usuario` ou link) e CNPJ (opcional, validado pelos dígitos verificadores; a Receita
  não é consultada), além de uma descrição. Ficam em `partners.partners`; na POC, uma conta = um parceiro.
- **Status:** `pending` → `approved` | `rejected`. Editar ou reenviar sempre volta para `pending`.

## Segurança (três camadas)

1. **Páginas:** `/admin/parceiros` usa `requireRole("admin")` (404 para os demais).
2. **Actions e casos de uso:** `withRole("admin")` na action e `isAdmin` conferido de novo em
   `ApprovePartner` e `RejectPartner`.
3. **Banco (RLS):** o repositório roda tudo com `asUser`. As políticas garantem que:
   - cada pessoa só **lê e edita o próprio** cadastro, e só enquanto não está aprovado;
   - **ninguém se aprova** (o dono só consegue gravar `status = 'pending'`);
   - só admin muda o status, e **recusa sem motivo** é barrada por `check`.

Tudo isso é coberto por testes de integração (`postgres-partner-repository.int.test.ts`).

## Integração entre módulos

- Aprovar concede o papel pela **API pública do identity** (`grantRole`), sem tocar nas tabelas dele.
  A operação é **idempotente**: se algo falhar no meio, aprovar de novo completa o processo.
- A fila mostra nome e e-mail de quem pediu via `usersByIds` (API pública do identity).
- Evento publicado: `partners.PartnerApproved { partnerId, userId }` (para analytics/notificações futuras).

## Próximos slices

- #27 estrutura do portal: ✅ `/parceiro/(inicio|lugares|eventos|live|missoes|dados)`, protegida por `requirePartner` (sem sessão → login; sem papel/cadastro aprovado → `/parceiro`). As seções vivem em `features/portal/portal-sections.ts` (arquivo comum, sem "use client", porque páginas de servidor também usam);
- #28 reivindicar lugar: ✅ (abaixo).

## Reivindicar e editar um lugar (#28)

```
/parceiro/lugares → busca o lugar → "É meu" → pedido pendente → admin aprova em /admin/parceiros
   → evento partners.PlaceClaimApproved → módulo places marca managed_by → parceiro edita em /parceiro/lugares/<id>/editar
```

- **Pedidos** em `partners.place_claims` (RLS): o parceiro aprovado só vê e pede os próprios; só admin revisa;
  recusa exige motivo. **Um lugar, um dono**: índice único em `place_id` para pedidos aprovados.
- **Desacoplamento:** `partners` consulta lugares pela API pública de `places` (busca e resumo). A aprovação
  publica `partners.PlaceClaimApproved`, e `places` **assina o evento** (registrado em `src/bootstrap`) e
  marca o responsável. `places` não importa `partners`: a dependência vai num sentido só.
- **Edição pelo dono:** nome, categoria, endereço, telefone, site e horário (editor dia a dia, convertido
  para o formato do OSM, agrupando dias iguais). Grava com `asUser` e **RLS em `places.places`**: só o dono
  ou admin altera, e só as colunas liberadas (localização, origem e `managed_by` não podem ser alteradas).
  Salvar marca `edited_by_partner_at`, e a reimportação do OSM nunca sobrescreve.
- Lugar com responsável aparece como "Já tem responsável", sem revelar quem é.

## Descontos e promoções (#30)

```
Portal /parceiro/ofertas → "Nova oferta" (lugar que gerencia ou evento que criou)
   → página do lugar/evento: "Ofertas" → explorador logado toca "Resgatar" → código ABCD-EFGH
   → fica em "Meus resgates" (/perfil) → no balcão, o parceiro digita o código em "Validar código"
```

- **Oferta** (`partners.offers`): título, descrição/regras, validade (início e fim no horário de Joinville,
  até 1 ano), limite total de resgates (opcional) e **1 resgate por pessoa**. Vale num lugar (`target_type = 'place'`)
  ou evento (`'event'`), guardado só pelo id (sem FK entre schemas).
- **Posse:** o caso de uso (`SaveOffer`) confere pelas APIs públicas: `placesManagedBy` (lugares) e `eventsByOwner`
  (eventos agendados que ainda não terminaram). A RLS não consulta outros schemas.
- **Editar** só enquanto ninguém resgatou (caso de uso + trigger `lock_offer_after_redemption`); depois, só **encerrar**.
  Encerrar é definitivo e para novos resgates; **códigos já emitidos continuam valendo até o fim da validade**
  (quem resgatou não perde o direito).
- **Na página do lugar/evento** (`OffersSection`, no slot `extras` dos cards de detalhe): ofertas ativas que ainda não
  terminaram, com "N restantes". Ainda não começou ("Em breve") ou esgotada → **indisponível**, sem botão.
  Visitante vê "Entre para resgatar"; o parceiro dono vê "Esta oferta é sua" (não resgata a própria).

### Código de resgate

- 8 símbolos de `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (sem 0/O, 1/I/L), mostrado como `ABCD-EFGH`; sorteio com
  `crypto.getRandomValues` sem viés (rejeição). ≈ 8,5 × 10¹¹ combinações; `unique` no banco (colisão → sorteia outro).
- A digitação é normalizada (maiúsculas, sem espaço/hífen).

### Garantias (banco + caso de uso)

| Regra | Como |
|-------|------|
| 1 resgate por pessoa, idempotente | `unique (offer_id, user_id)` + `on conflict do nothing`; resgatar de novo devolve o mesmo código e **não publica evento** |
| Limite total sob concorrência | Trigger `AFTER INSERT` (`count_redemption`, security definer) faz `update ... set redeemed_count = redeemed_count + 1 where redeemed_count < max`: o lock na linha da oferta serializa os resgates; sem linha atualizada → erro `LAESG` e o resgate é desfeito. `check (redeemed_count <= max_redemptions)` como rede de segurança. Teste de integração com 12 resgates simultâneos e limite 5 |
| Só na validade, oferta ativa, nunca a própria | Caso de uso **e** RLS do insert em `offer_redemptions` |
| Contador e dono imutáveis | Column grants: `redeemed_count` e `partner_id` fora do UPDATE; insert de resgate só com `offer_id, user_id, code` |
| Validar: só o dono da oferta, uma vez só | `findForPartner` com RLS (`partners.owns_offer`) + filtro por parceiro; `update ... where validated_at is null`; política de UPDATE só nas colunas `validated_at`/`validated_by`, com `validated_by = auth.uid()` |
| Não vazar códigos de outras ofertas | Código de outro parceiro e código inexistente recebem a mesma resposta: **"Código inválido."** |

- Validar grava **quem validou e quando**. Código já usado → "já foi usado em ..."; depois do fim da validade → "não vale mais".
- O id de quem resgata/valida vem sempre da sessão (`withUser` / `withRole("partner")` + cadastro aprovado).

### Eventos e analytics

- `partners.OfferRedeemed { offerId, redemptionId, userId, targetType, targetId }` (só no primeiro resgate).
- `partners.OfferValidated { offerId, redemptionId, userId, validatedBy, targetType, targetId }`.
- O analytics registra a **validação** como `checkin` no lugar/evento (a pessoa esteve lá), sem tipo novo nem
  migration; entra nos check-ins e na conversão do painel (#78). O resgate em si não vira métrica.

### LGPD

- Exportação: `ofertasResgatadas` (código, oferta, onde vale, datas) e `ofertasQueCriei`.
- Exclusão da conta: resgates saem em **cascata** (`user_id ... on delete cascade`); as ofertas saem com o
  cadastro de parceiro. Se quem validou excluir a conta, `validated_by` vira `null` (a data fica).

### API pública

`OffersSection`, `MyRedemptionsCard`, `OfferForm`, `EndOfferButton`, `ValidateCodeForm`, `myRedemptions(userId)`,
`myOffers(session)`, `offersCreatedBy(userId)`, `offerTargetChoices(session)`, `editableOffer(session, id)`.

## Suspensão de parceiro (#144)

- O admin suspende um parceiro **aprovado**, com motivo obrigatório, e reativa depois, em `/admin/parceiros`.
- Enquanto suspenso, o parceiro perde o portal (vê o motivo em `/parceiro`) e **o que ele publicou some
  das telas públicas**: eventos, missões (catálogo, surpresas e aceite), ofertas e lives.
- **Como some:** uma trigger em `partners.partners` mantém o espelho `platform.suspended_owners` na mesma
  transação da mudança de status. Os módulos donos filtram as leituras públicas com
  `not platform.owner_suspended(owner_id)`, sem join entre schemas e sem depender de evento em memória.
- Reativar devolve tudo, sem recadastro. A fila de revisão não reaprova um parceiro suspenso.
- Eventos de domínio `partners.PartnerSuspended` e `partners.PartnerReactivated` avisam os interessados
  (auditoria, notificações).
- **Limitações:** quem já tinha aceitado uma missão continua vendo o progresso dela; códigos de oferta já
  emitidos continuam no perfil de quem resgatou.

## Destaque patrocinado (#29)

- Em `/parceiro/destaque`, o parceiro destaca um **lugar que gerencia** ou um **evento seu** por 7, 15 ou 30 dias,
  com até 3 destaques ao mesmo tempo, e pode encerrar antes do fim.
- **O direito vem do plano:** o recurso `destaque` (módulo billing, consultado por `hasPlanFeature`). Não há cobrança
  avulsa por destaque. Sem o recurso, a tela explica e leva a `/parceiro/assinatura`.
- **Na recomendação**, o destaque é um sinal de score próprio (`sponsored`, peso 2, ajustável em
  `RECOMMENDATION_WEIGHTS`) e o item é sempre sinalizado como **“Patrocinado”** no card, separado dos motivos
  ("Por que sugerimos"). Ele ajuda no ranking, mas não passa por cima de tudo.
- A recomendação lê os destaques pela API pública `sponsoredKeysNow()`; destaques de parceiro suspenso ficam de fora.
- Se a assinatura for suspensa e a conta perder o direito ao destaque, os destaques dela são encerrados (o módulo
  assina `billing.SubscriptionSuspended`).
- Um alvo tem no máximo um destaque ativo (índice único), e o período máximo é garantido também pelo banco.

## Equipe do parceiro: dono e membro (#158)

O dono convida funcionários para atender no balcão sem dar acesso total ao portal.

```
Portal /parceiro/equipe → dono digita o e-mail do funcionário → entra em partners.team_members
Funcionário entra no app com esse e-mail → /parceiro mostra "Você faz parte de uma equipe" → /parceiro/balcao
   → valida o código que o cliente mostra (o mesmo formulário do dono em /parceiro/ofertas)
```

| O quê | Dono | Membro |
| --- | --- | --- |
| Validar códigos de oferta | sim | sim (`/parceiro/balcao`) |
| Ofertas, eventos, lugares, missões, live, destaque | sim | não |
| Dados e assinatura | sim | não |
| Convidar e remover membros | sim | não |

- **Vínculo pelo e-mail confirmado.** Não há token nem aceite: o convite vale quando existe uma conta com aquele
  e-mail **confirmado** (a tela do dono mostra "Com acesso" ou "Aguardando cadastro"). Até 10 membros por parceiro;
  o dono não convida o próprio e-mail.
- **O membro não recebe o papel `partner`.** O portal (`requirePartner`) continua só do dono; o balcão é uma página
  à parte que confere a equipe a cada requisição. A action de validar aceita quem atende em algum balcão
  (`ValidateCodeAtCounter`: o parceiro do dono + as equipes do membro) e procura o código só nas ofertas deles.
- **Segunda camada no banco (RLS).** `partners.is_team_member(partner_id)` e `partners.staffs_offer(offer_id)`
  liberam ao membro **ler e validar resgates** das ofertas do parceiro, e nada mais. A tabela da equipe só é lida e
  alterada pelo dono. Quem atende (dono ou membro) não resgata a oferta do próprio balcão.
- **Remoção vale na hora.** Apagar a linha encerra o acesso: a próxima validação já é recusada, mesmo com a tela
  aberta. Parceiro suspenso também tira o acesso da equipe; reativado, ele volta.
- **LGPD.** O e-mail do convidado fica só na equipe do parceiro e some quando o dono remove o membro ou o cadastro
  do parceiro é excluído. A validação fica registrada em nome de quem validou (`validated_by`).

Limitações: o convite não envia e-mail (o dono avisa o funcionário); o membro só valida códigos de oferta — não há
outros níveis de permissão; a entrada e a saída de membros não geram evento de domínio nem trilha de auditoria.
