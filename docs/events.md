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

## Segurança

- **RLS em `events.events`:** todos leem; só o papel `partner` cria, sempre em nome próprio; só o dono
  ou o admin editam/cancelam. O dono **não transfere** o evento (`owner_id` fora do grant de UPDATE).
- O caso de uso confere o papel e o dono antes; o repositório grava com `asUser`.
- A edição de evento alheio responde 404.

## Integração

- O lugar é validado pela API pública de `places` (`placeSummary`), e o seletor de lugar é o
  `PlacePicker` de `places`, passado pela página como "slot" do formulário.
- Eventos publicados: `events.EventPublished { eventId, placeId, ownerId }` e `events.EventCancelled { eventId }`.
