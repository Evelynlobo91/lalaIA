# Missões urbanas

Missões levam o explorador a lugares de Joinville. Cada missão tem **etapas ordenadas**, cada etapa
acontece num lugar e é comprovada por um **tipo de validação** (na POC, QR code no balcão).

## Modelo e criação (#57, RF26)

- **Missão:** título, descrição, **XP total**, janela de validade (início e fim, no horário de
  Joinville) e status (`active` ou `archived`). De 1 a 10 etapas.
- **Etapa:** posição (1, 2, 3...), o que fazer ("Peça o café especial"), o lugar (`place_id`, sem FK
  entre schemas) e o tipo de validação (`qr`).
- **XP:** o total é dividido entre as etapas e um bônus de conclusão (`xpSplit`): cada etapa vale
  `floor(total / (etapas + 1))` e o bônus fica com o resto. Ex.: 100 XP em 3 etapas = 25 por etapa + 25 de bônus.
  A soma é sempre exatamente o total.
- **Quem cria:**
  - **parceiro** (portal, `/parceiro/missoes`): só com etapas nos lugares que **administra**
    (`placesManagedBy`, API pública de places). Sem lugar, o portal pede para reivindicar um primeiro;
  - **admin**: em qualquer lugar existente (regra no caso de uso e na RLS; sem tela própria na POC).
- **Editar** mantém o id de cada etapa pela posição (o QR impresso da etapa 1 continua valendo).
  **Encerrar** (com confirmação) tira a missão da lista pública e não pode ser desfeito.

### Segurança

- O caso de uso confere o papel, o dono e os lugares; a action usa `withUser` (id sempre da sessão).
- **RLS no schema `missions`** (repositório grava com `asUser`): todos leem; só `partner`/`admin`
  criam, sempre em nome próprio; só o dono ou o admin editam/encerram; o dono não transfere a missão
  (`owner_id` fora do grant de UPDATE); etapas só na própria missão.
- Se o lugar é do parceiro, quem confere é o caso de uso: a RLS não consulta `places` (sem junção entre schemas).

## Aceitar missão (#58, RF28)

- `/missoes` (pública): missões **disponíveis agora** (ativas e dentro da janela), com XP, etapas,
  lugares e prazo. Visitante vê "Entre para aceitar"; logado, "Aceitar missão".
- Aceitar cria uma instância em `missions.user_missions` (**uma por usuário e missão**, `unique`).
  Aceitar de novo é idempotente. Regras (`AcceptMission`):
  - só missão disponível (fora da janela ou encerrada → recusada; a RLS confere de novo);
  - **até 5 missões em andamento** ao mesmo tempo (`MAX_ACTIVE_MISSIONS`);
  - quem criou a missão não pode jogá-la (tem os QR codes em mãos).
- As missões ativas aparecem em `/missoes` ("Suas missões ativas") e no `/perfil`.
- **Depois do primeiro aceite, etapas e XP travam** (quem aceitou joga a missão que viu): o caso de
  uso recusa a mudança, a RLS de `mission_steps` bloqueia via `missions.has_participants()` (security
  definer: o dono não lê os aceites alheios) e um trigger impede mudar o XP. Título, descrição e
  janela continuam editáveis.
- **RLS:** cada pessoa só lê e cria os próprios aceites, sempre como `active`.

## Progresso da missão (#59, RF29)

- `/missoes/<id>`: descrição, prazo, XP por etapa e bônus, **barra de progresso** (`role="progressbar"`)
  e as etapas em ordem com status **Concluída / Próxima / Pendente**, a data de conclusão e o lugar de
  cada etapa (link para `/lugares/<id>`; nome e bairro pela API pública de places, numa consulta só).
- Visitante e quem não aceitou veem as etapas e o botão de aceitar. Missão fora do prazo ou encerrada
  só aparece para quem já a aceitou; id inválido ou inexistente → 404.
- O progresso é **derivado** de `missions.step_completions` (nunca um número guardado):
  `progressOf` e `stepStates` são funções puras e testadas. O percentual também aparece em
  "Suas missões ativas" e no perfil.
- **`missions.step_completions` é append-only** (sem UPDATE/DELETE) com `unique (user_mission_id, step_id)`.
  A RLS só deixa a pessoa gravar conclusões na **própria missão aceita e ativa**, com uma etapa **dessa
  missão**, e só deixa marcar a missão como concluída quando **todas** as etapas foram concluídas.

## Validar etapa por QR code no balcão (#60, RF30)

```
Portal /parceiro/missoes/<id>/qr ──(QR na tela ou impresso)──► celular do explorador
   ► /missoes/validar?t=<token>  (login se preciso; só CONFERE, GET não grava)
   ► "Concluir etapa" (POST, Server Action)  ► CompleteStep
   ► grava a etapa (+ conclui a missão se era a última) ► publica missions.StepCompleted / MissionCompleted
   ► progression credita o XP (assinante)
```

- **Portal:** "QR codes" em cada missão ativa mostra um QR por etapa (SVG gerado no servidor pela lib
  [`qrcode`](https://www.npmjs.com/package/qrcode), MIT, sem serviço externo).
  - **Tela do balcão (padrão):** o QR **gira a cada minuto** (a página se atualiza sozinha) e cada
    token vale de 4 a 5 minutos. Todos que abrem no mesmo minuto veem o mesmo QR.
  - **Versão para imprimir:** vale **até 23:59 do dia** (horário de Joinville); imprime-se um por dia.
- **Validação como estratégia (OCP):** `CompleteStep` não sabe o que é QR. Ele escolhe o
  `StepValidator` pelo tipo da etapa (`QrCodeValidator` hoje). GPS/geofence entra como nova prova
  (`StepProof`) + nova estratégia registrada na composição, sem mudar o caso de uso.

### Desenho anti-fraude

| Ameaça | Defesa |
|--------|--------|
| Forjar um QR / trocar a etapa ou a validade no link | Token `<stepId>.<exp>.<assinatura>`, com **HMAC-SHA256** (`MISSIONS_QR_SECRET`, só no servidor) sobre `stepId` e `exp`; comparação em tempo constante (`timingSafeEqual`). Qualquer alteração → "QR inválido". |
| Foto do QR mandada para amigos / validar de casa depois | **Expiração curta e rotativa** (4–5 min na tela; impresso só no dia). Nenhum token vale mais de 26 h, mesmo bem assinado. |
| Escanear de novo para ganhar XP de novo | **Uso único por usuário/etapa**: checagem no caso de uso + `unique (user_mission_id, step_id)` no banco + `on conflict do nothing`. Repetir é recusado e **não publica evento** (o XP também é idempotente no progression). |
| QR de uma etapa usado como prova de outra | O token carrega o `stepId` assinado; o validador exige que seja **a etapa** que está sendo concluída. |
| Pular etapas | **Ordem obrigatória**: só conclui a etapa N com as anteriores feitas. |
| Validar sem ter aceitado, em missão de outra pessoa, encerrada ou fora do prazo | Caso de uso (`mission_not_accepted`, `mission_unavailable`...) **e** RLS em `step_completions` (só na própria missão aceita e ativa, com etapa dessa missão). |
| Parceiro jogar a própria missão (tem os QR codes) | Quem criou não aceita a própria missão. |
| Link malicioso que conclui etapa sozinho (CSRF via GET, prévia de links) | A página do QR só **confere**; concluir exige o **POST** do botão (Server Action, protegida pelo Next). |
| Trocar o usuário no formulário (IDOR) | O id vem sempre da sessão (`withUser`), nunca da requisição. |

Limitação conhecida (POC): quem está no balcão pode fotografar o QR e repassar na hora (dentro dos
minutos de validade). A evolução natural é combinar com GPS (`GeofenceValidator`) na mesma etapa.

### Configuração

`MISSIONS_QR_SECRET` (obrigatória no servidor, mínimo 32 caracteres, uma por ambiente; veja
`.env.example`). Trocar o segredo invalida na hora todos os QR codes (inclusive os impressos do dia).
No CI de E2E é gerada aleatoriamente a cada execução.

### Eventos publicados

- `missions.StepCompleted { userId, missionId, stepId, xp }`: XP da etapa.
- `missions.MissionCompleted { userId, missionId, xp }`: bônus de conclusão (só na primeira vez).

Publicados **depois** de gravar. Missões não concedem XP: quem credita é o módulo `progression`.

## Livro-razão de XP (#65, RF31) — módulo `progression`

- `progression.xp_transactions` é **append-only**: um trigger recusa `UPDATE`, `DELETE` e `TRUNCATE`
  para qualquer papel (inclusive o backend). A única exceção é a exclusão em cascata da conta (LGPD),
  que chega por trigger de FK (`pg_trigger_depth() > 1`).
- **Escrita só pelo backend**, pela assinatura de eventos: `progression` exporta `subscriptions`
  (registradas em `src/bootstrap/register-subscriptions.ts`) e reage a `missions.StepCompleted` e
  `missions.MissionCompleted`. O payload é validado com zod; o módulo `missions` não conhece `progression`.
- **Idempotência em duas chaves `unique`** + `on conflict do nothing`:
  - `event_id`: reprocessar o mesmo evento não credita de novo;
  - `(user_id, reason, source_id)` (chave natural: a etapa ou a missão): mesmo que o fato seja
    republicado com outro id de evento, a mesma etapa/missão credita uma vez só.
- A descrição ("Etapa concluída · Rota do Café") é **congelada** no crédito (título via API pública
  de `missions`); se o título não vier, fica só o rótulo.
- **Saldo = soma do livro**: view `progression.xp_balances` com `security_invoker`, então a RLS da
  tabela vale também na view. **RLS:** cada pessoa lê só as próprias transações; `authenticated` não
  tem grant de escrita.
- `/perfil` ganhou a seção **"Seu XP"**: saldo e as últimas 10 transações.

> O bus é in-process: se o processo cair entre gravar a etapa e o handler gravar o XP, o crédito se
> perde. A evolução prevista (docs/architecture.md) é um outbox, sem mudar as portas.
