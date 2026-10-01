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
- `EventDetailCard` recebe `extras` (favoritar, Live...) sem conhecer esses módulos.

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
