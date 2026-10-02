# Eventos ("O que fazer")

## Cadastro pelo parceiro (#36)

- **Portal:** `/parceiro/eventos` lista próximos, já realizados e cancelados. "Novo evento", "Editar"
  e "Cancelar" (com confirmação).
- **Campos:** título, lugar (busca com sugestões entre os lugares de Joinville; um promotor pode usar
  qualquer lugar), categoria do catálogo, início e término, valor ("a partir de"; vazio = grátis)
  e descrição.
- **Regras** (zod + caso de uso + `check` no banco):
  - o término tem de ser depois do início; duração máxima de 14 dias;
  - não se cria evento no passado (tolerância de 5 min);
  - evento cancelado ou já terminado não é editável;
  - cancelar não apaga: o evento continua visível como "cancelado".
- **Fuso:** os campos `datetime-local` são interpretados no horário de Joinville
  (`src/shared/time/joinville-time.ts`, com o deslocamento calculado por `Intl`), e o banco guarda em UTC.

## Lista pública (#37)

- `/eventos` e `GET /api/events?cursor=`: agendados que ainda não terminaram, por início (keyset em
  `starts_at, id`), com "Acontecendo" para quem já começou. Terminados e cancelados não aparecem.
- Nome e bairro dos lugares vêm de `placeSummaries` (API pública de places), numa consulta só por página.

## Filtro por data (#39)

- `/eventos?quando=hoje|amanha|fim-de-semana|AAAA-MM-DD` (e a mesma opção na API). Atalhos e um campo de data,
  sem JavaScript (links + formulário GET); o filtro fica na URL e vale também para "Carregar mais".
- Calculado no **calendário de Joinville** (`src/modules/events/domain/date-window.ts`): às 23:30 de segunda
  ainda é "hoje", mesmo já sendo terça em UTC. "Este fim de semana" = sábado 00:00 até segunda 00:00 (no sábado e
  no domingo, é o fim de semana corrente).
- Um evento entra quando **se sobrepõe** ao período (uma feira de 3 dias aparece em cada um dos dias).
- Data impossível (ex.: 31/02) → aviso na página e 400 na API.

## Página do evento (#38)

- `/eventos/[id]`: quando, onde (com link para o lugar e endereço), valor, descrição e "Como chegar".
- Fases: **acontecendo agora**, **encerrado** e **cancelado** (com aviso); encerrado e cancelado não
  mostram "Como chegar". Os links já compartilhados continuam funcionando.
- Open Graph com imagem gerada por evento (título, data e lugar) para Instagram e WhatsApp; cancelados
  ficam fora dos buscadores (`noindex`). 404 real para id inexistente ou inválido.
- `EventDetailCard` recebe `extras` (favoritar, Live...) sem conhecer esses módulos, e `directions`, que
  substitui o "Como chegar" (ex.: o "Quero ir" de favoritos).

## Filtro por categoria (#40)

- `/eventos?categoria=shows,feiras` (uma ou várias, separadas por vírgula; `GET /api/events` aceita o mesmo).
  A seleção volta **na ordem do catálogo e sem repetição**, então a mesma escolha gera sempre a mesma URL.
- Categorias do catálogo único `src/shared/catalog/categories` (as mesmas de lugares). Categoria
  desconhecida mostra aviso na página e devolve 400 na API.
- Chips (links, funcionam sem JavaScript; no celular rolam na horizontal): cada um liga/desliga a
  categoria. "Todas as categorias" limpa. **Data e categoria se combinam**: um filtro preserva o outro
  (`eventListHref` em `features/list-events/list-filters.ts` monta a URL a partir do estado dos dois).
- No banco: `category in (...)` na mesma consulta keyset da lista (`EventQuery.categories`).

## Acontecendo agora / em breve (#41)

- `/eventos/agora` (e `GET /api/events/agora?lat=&lon=`): seções **Agora** e **Em breve (próximas 3h)**.
- Regras puras em `domain/happening.ts`, com testes: `isHappeningAt` (início inclusivo, fim exclusivo),
  `startsSoon` (janela de 3 h) e os rótulos "Começou há 1 h 20 min" / "Começa em 40 min". A lista,
  o detalhe (`phaseOf`) e esta tela usam a mesma regra.
- Uma consulta só: eventos que se sobrepõem a `[agora, agora + 3 h)` (até 60), separados em memória.
- **Distância (opcional):** botão "Ver distância" (GPS pedido só no toque, coordenada arredondada para
  ~10 m e não gravada, como no "Perto de mim" de lugares). Com localização, cada seção é ordenada pela
  mais perto. A distância vem da API pública de places (`placeDistances`, PostGIS `ST_Distance`, uma consulta).
  Localização inválida ou fora de Joinville → aviso, e a tela continua sem distância.

## Segurança

- **RLS em `events.events`:** todos leem; só o papel `partner` cria, sempre em nome próprio; só o dono
  ou o admin editam/cancelam. O dono **não transfere** o evento (`owner_id` fora do grant de UPDATE).
- O caso de uso confere o papel e o dono antes; o repositório grava com `asUser`.
- A edição de evento alheio responde 404.

## Integração

- O lugar é validado pela API pública de `places` (`placeSummary`), e o seletor de lugar é o
  `PlacePicker` de `places`, passado pela página como "slot" do formulário.
- Eventos publicados: `events.EventPublished { eventId, placeId, ownerId }` e `events.EventCancelled { eventId }`.
- `eventSummaries(ids)`: resumos de vários eventos (inclusive terminados e cancelados) com o nome do lugar, em lote (duas consultas no total). Usado pelos favoritos.
