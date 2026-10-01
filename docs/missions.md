# Missões urbanas

Missões levam o explorador a lugares de Joinville. Cada missão tem **etapas ordenadas**, cada etapa
acontece num lugar e é comprovada por um **tipo de validação** (na POC, QR code no balcão).

## Modelo e criação (#57, RF26)

- **Missão:** título, descrição, **XP total**, janela de validade (início e fim, no horário de
  Joinville) e status (`active` ou `archived`). De 1 a 10 etapas.
- **Etapa:** posição (1, 2, 3...), o que fazer ("Peça o café especial"), o lugar (`place_id`, sem FK
  entre schemas) e o tipo de validação (`qr`, `gps` ou `qr_gps`; veja #61).
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
minutos de validade). Para isso existe a etapa **QR + GPS** (#61, abaixo).

## Validar etapa por check-in GPS com geofence (#61, RF30)

```
/missoes/<id> (próxima etapa "gps") ─► "Fazer check-in" (GPS pedido SÓ no toque; respeita o cookie lalaia-geo)
   ► POST (Server Action) { stepId, lat, lon, accuracy }  (lat/lon arredondados, área atendida: servicePointShape)
   ► GeofenceCheckIn ► CompleteStep ► GeofenceValidator (estratégia "gps")
        consentimento ► limite de tentativas ► precisão ► distância PostGIS (placeDistances) ► permanência
   ► grava a etapa ► missions.StepCompleted / MissionCompleted (iguais ao QR)
```

- **O parceiro escolhe, por etapa** (formulário da missão): **QR code no balcão** (`qr`), **check-in por GPS**
  (`gps`) ou **QR code + GPS** (`qr_gps`). Com GPS, define o **raio** (30 a 300 m, padrão 100) em volta do lugar
  da etapa e, só no `gps`, o **tempo mínimo no lugar** (0 a 30 min, padrão 2). Em `qr_gps` a permanência é sempre
  0: o QR do balcão, que gira a cada minuto, já comprova a presença. Colunas `geofence_radius_m` e `dwell_minutes`
  em `missions.mission_steps`, com `check` no banco. Etapas e geofence travam depois do primeiro aceite, como antes.
- **Estratégias novas, `CompleteStep` intacto** (só passou a avisar a estratégia de que é uma prévia, `dryRun`):
  - `GeofenceValidator` (`gps`): a prova é `{ kind: "gps", fix }`;
  - `QrAndGeofenceValidator` (`qr_gps`): QR válido **e** posição no raio. Na prévia do link do QR (GET) confere só o
    QR; a localização é pedida no toque de "Concluir etapa" (`ConfirmStepForm needsLocation`). Sem posição → recusado.
  - As duas usam `GeofenceCheck`, que aplica as regras abaixo. As etapas `gps` não aparecem nos QR codes do portal.
- **Permanência mínima (issue):** o primeiro check-in dentro do raio responde "Você chegou! Fique por perto e faça
  o check-in de novo em N minutos"; o check-in seguinte, depois do tempo e ainda no raio, conclui a etapa. Um
  check-in **fora** do raio zera a contagem, e a chegada só vale por (permanência + 30 min). Regra pura `dwellStatus`.
- **Recompensa real (issue):** GPS é falsificável no celular. `allowsRealReward(mission)` (exportada) só é verdadeira
  quando **toda** etapa exige o QR (`qr` ou `qr_gps`). A recompensa de parceiro (#62) deve usá-la ao vincular um prêmio;
  o formulário avisa que etapa só por GPS vale XP, não prêmio.

### Anti-fraude e privacidade do check-in

| Ameaça / cuidado | Defesa |
|------------------|--------|
| GPS "chutado" ou de rede (Wi-Fi/antena) | `accuracy` acima de **100 m** (`MAX_ACCURACY_METERS`) é recusada ("localização imprecisa"), sem nem calcular a distância. |
| Força bruta de posições até acertar o raio | **10 tentativas por etapa e por pessoa a cada 60 min** (`GEOFENCE_ATTEMPTS`); a 11ª é recusada sem gravar. |
| Distância calculada no cliente | O servidor calcula com **PostGIS** (`ST_Distance` em geografia) pela API pública de places (`placeDistances`), até o lugar **da etapa**. |
| Pular etapas / repetir / etapa de outra missão | As mesmas regras do QR em `CompleteStep`: ordem obrigatória, uso único, missão aceita, ativa e no prazo; RLS de `step_completions`. |
| Gravar a localização da pessoa (LGPD) | A coordenada **nunca é gravada nem logada**: `missions.geofence_checkins` guarda só etapa, resultado (`inside`/`outside`/`inaccurate`), **distância arredondada para 10 m** e horário. A tabela nem tem coluna de coordenada (coberto em teste). |
| Consentimento revogado | O navegador não pede o GPS com `lalaia-geo=0`, e o servidor confere de novo `consentsOf(userId).geolocation` antes de qualquer coisa. |
| Forjar o histórico de tentativas | `geofence_checkins` é **append-only** (sem UPDATE/DELETE), RLS só em nome próprio e só em etapas com GPS; `attempted_at` fora do grant de INSERT (sempre o horário do banco). |
| CSRF / IDOR | Server Action (POST) com `withUser`: o id vem da sessão, nunca do formulário. |

As tentativas entram na exportação LGPD (`checkinsPorGps`, via `myGeofenceCheckIns`) e saem em cascata com a conta.
Limitação conhecida: quem falsifica o GPS do aparelho consegue concluir etapas `gps` (por isso elas não valem prêmio);
para etapas que precisam de garantia, use `qr_gps`.

### Configuração

`MISSIONS_QR_SECRET` (obrigatória no servidor, mínimo 32 caracteres, uma por ambiente; veja
`.env.example`). Trocar o segredo invalida na hora todos os QR codes (inclusive os impressos do dia).
No CI de E2E é gerada aleatoriamente a cada execução.

### Eventos publicados

- `missions.StepCompleted { userId, missionId, stepId, xp }`: XP da etapa.
- `missions.MissionCompleted { userId, missionId, xp }`: bônus de conclusão (só na primeira vez).

Publicados **depois** de gravar. Missões não concedem XP: quem credita é o módulo `progression`.

## Missões surpresa (#63, RF35)

```
/missoes ─► "Procurar missão surpresa por perto" (GPS só no toque; respeita lalaia-geo)
   ► POST { lat, lon } ► OfferSurpriseMission.findNear
        surpresas no prazo ► tira as já oferecidas/aceitas, as próprias e as que acabam em < 1 h
        ► distância PostGIS até a 1ª etapa (placeDistances) ≤ 1 km ► a mais perto
   ► surprise_offers (vale 30 min) ► card "Aceite até 15:40" com Aceitar surpresa / Ignorar
   ► Aceitar ► user_missions + oferta "accepted" (mesma transação) ► /missoes/<id>: etapas uma por vez
```

- **O parceiro marca a missão como surpresa** no formulário (`missions.surprise`). Ela **sai da lista pública**
  (`listAvailable` filtra; logo também sai dos candidatos da recomendação) e o link direto dá **404** para quem não
  tem aceite nem oferta aberta (não revela que existe).
- **Gatilho por proximidade e horário:** a primeira etapa a até **1 km** (`SURPRISE_RADIUS_METERS`), missão no prazo
  e com pelo menos **1 h** pela frente (`SURPRISE_MIN_REMAINING_MINUTES`). Entre as elegíveis, a mais perto.
- **Validade curta:** a oferta vale **30 min** (`SURPRISE_OFFER_MINUTES`), nunca depois do fim da missão. O banco
  limita a 2 h e grava o `offered_at` com o horário dele.
- **Aceitar ou ignorar:** uma oferta por pessoa e missão (`unique`); ignorada ou vencida, **não volta**. Enquanto há
  uma oferta aberta, procurar de novo devolve a mesma. Com 5 missões em andamento, não oferece.
- **Etapas escondidas:** antes do aceite, a tela mostra título, descrição, XP, quantas etapas e a distância até a
  primeira, mas **nenhuma etapa nem lugar**. Depois do aceite, `revealedStepIds` revela as concluídas e **a próxima**;
  as seguintes aparecem como "Etapa surpresa" (os lugares escondidos nem são consultados nem saem do servidor).
  Nos cards de "Suas missões ativas" e no perfil, a surpresa não lista lugares.
- **Segurança:** `AcceptMission` recusa missão surpresa (`surprise_requires_offer`) e a **RLS de `user_missions`**
  só aceita missão surpresa com uma oferta aberta da própria pessoa. `surprise_offers` tem RLS (só a própria; não
  recebe oferta da própria missão nem de missão comum; aceitar só antes de expirar; resposta não volta a "offered").
  Actions com `withUser`; a posição vive só na requisição (não é gravada nem logada).
- **Motor de recomendação:** o módulo `recommendation` depende de `missions` (fonte de candidatos), então `missions`
  não pode chamar o motor sem criar um ciclo. A surpresa usa os mesmos sinais objetivos (proximidade por PostGIS e
  disponibilidade no horário); as missões comuns seguem ranqueadas pelo motor (#64).

## Recomendar missões (#64, RF27)

- O parceiro pode informar o **tempo estimado** (10 a 600 min; sem valor, 30 min por etapa: `estimatedMinutesOf`) e o
  **gasto por pessoa** (R$ 0 a R$ 1.000; 0 = grátis; sem valor = não informado). Colunas `estimated_minutes` e
  `cost_cents` em `missions.missions`, com `check` no banco. Os cards de missão mostram "Cerca de 1 h 30 · Grátis".
- `MissionCard` (de `availableMissions()`) passou a trazer `estimatedMinutes`, `costCents` e `surprise`.
- O ranking ("Missões para você", em `/missoes` e `/sugestoes`) mora no módulo `recommendation`: veja
  [recomendação](recommendation.md#missões-para-você-64-rf27). Missões não têm categoria própria: ela é derivada dos
  lugares das etapas pela API pública de places.

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

## Para outros módulos

- `missionExplorationOf(userId)`: missões concluídas, etapas concluídas (check-ins) e ids dos lugares das
  etapas concluídas, numa consulta como o próprio usuário (RLS). Usado pelo [progression](progression.md).
