# Favoritos

Módulo `favorites` (epic #7): lugares e eventos salvos pelo usuário.

## Favoritar e desfavoritar (#44, RF07)

- **Onde:** botão "Favoritar" na página do lugar (`/lugares/[id]`). Para a página de detalhe do evento,
  use `<FavoriteToggle entityType="event" entityId={id} />` (componente de servidor exportado pelo
  `index.ts`, que lê a sessão e o estado inicial). O `FavoriteButton` (cliente) também é exportado,
  para quem já tem esses dados.
- **Sem login:** o botão vira um link para `/entrar?next=<página atual>`; depois do login a pessoa volta
  para a mesma página.
- **Otimista:** o botão muda na hora e volta atrás, com a mensagem de erro, se o servidor recusar.
- **Acessível:** botão de alternância com `aria-pressed`; o rótulo é "Favoritar" ou "Remover dos favoritos".
- **Idempotente:** o cliente envia o estado desejado (`favorite=true|false`), não "inverta". Repetir o
  pedido dá o mesmo resultado, e a chave primária `(user_id, entity_type, entity_id)` impede duplicatas.
- **Validação:** zod (`entityType` ∈ `place|event`, `entityId` uuid). Só se favorita o que existe,
  conferido pela API pública do módulo dono: `placeSummary(id)` (places) e `eventSummaries(ids)` (events).
  Desfavoritar sempre funciona, mesmo que o item tenha sido removido.
- **Evento de domínio:** `favorites.FavoriteAdded { userId, entityType, entityId }`, publicado só quando
  o favorito é novo (para o Analytics).

## Meus favoritos (#45, RF08)

- **`/perfil/favoritos`** (protegida com `requireUser`; sem sessão vai ao login e volta), com link
  "Meus favoritos" no `/perfil`.
- **Abas Lugares / Eventos** como links (`?aba=lugares|eventos`, validado com zod; valor desconhecido
  volta para "lugares"), com `aria-current` e contagem. Funcionam sem JavaScript.
- **Lugares:** do favoritado mais recente para o mais antigo.
- **Eventos:** primeiro os que ainda vão acontecer (por início), depois os encerrados e cancelados
  (mais recentes primeiro), marcados com o selo "Encerrado" ou "Cancelado"; o que está rolando tem
  "Acontecendo". O link do evento aponta para `/eventos/<id>` (página de detalhe da #38).
- **Remover:** botão "Remover" em cada item (rótulo acessível "Remover <nome> dos favoritos"); usa o mesmo
  caso de uso do botão de favoritar, com o estado "não favorito", e atualiza a página (`revalidatePath`).
- **Estado vazio** por aba, com atalho para "Onde ir" ou "O que fazer".
- **Sem N+1:** os dados vêm em lote das APIs públicas, uma consulta por tipo: `placeSummaries(ids)` e
  `eventSummaries(ids)`. Item que não existe mais some da lista.

## "Quero ir" + Como chegar (#46)

- Na página do lugar, o botão principal passa a ser **"Quero ir · Como chegar"** (`WantToGoButton`),
  injetado pelo slot `directions` do `PlaceDetailCard` (sem ele, o card mantém o "Como chegar" padrão).
- É um link comum para a rota no app de mapas (`directionsUrl` de places: URL universal do Google Maps,
  que abre o app instalado no celular), em nova aba.
- Ao tocar, registra o clique em segundo plano com `fetch(..., { keepalive: true })` para
  `POST /api/favorites/want-to-go { entityType, entityId }` → **204**. O registro **nunca bloqueia nem atrasa**
  a navegação, e falhas são ignoradas.
- O caso de uso `RecordWantToGo` confere que o item existe (404 se não, para não poluir a métrica) e publica
  **`favorites.WantToGoClicked { userId | null, entityType, entityId }`**: métrica do promotor.
  Anônimo é permitido (`userId: null`); nenhum dado pessoal além do id, que vem só da sessão.
- Para o detalhe do evento (#38): `<WantToGoButton href={rotaDoLugar} entityType="event" entityId={id} />`.

## Modelo de dados

`favorites.favorites` (schema próprio):

| Coluna | Tipo | Observação |
|--------|------|------------|
| `user_id` | uuid | dono, `on delete cascade` com a conta |
| `entity_type` | text | `place` ou `event` (`check`) |
| `entity_id` | uuid | id no módulo dono, **sem FK** entre schemas (ADR 0001) |
| `created_at` | timestamptz | ordenação de "Meus favoritos" |

Chave primária `(user_id, entity_type, entity_id)`. Favorito é polimórfico: o módulo não conhece places
nem events, só consulta as APIs públicas deles. Um tipo novo (ex.: missão) é uma nova implementação de
`FavoriteTargetCatalog` mais uma linha no `check`, sem `if` nos casos de uso.

## Segurança

- O id do usuário vem **sempre da sessão** (`withUser`), nunca do formulário (anti-IDOR).
- **RLS:** o repositório roda tudo com `asUser`; cada pessoa só lê, cria e apaga os próprios favoritos.
  Não há UPDATE. `anon` não tem acesso ao schema. Coberto por `postgres-favorite-repository.int.test.ts`.
