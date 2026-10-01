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
