# Backoffice (`/admin`)

Área de operação interna da plataforma (Epic #86). Só quem tem o papel `admin` entra; para os demais
a área responde **404**, o que não revela que ela existe (RNF05).

- **Shell** (#141): `src/app/(app)/admin/layout.tsx` confere o papel e monta o cabeçalho e as abas
  (`BackofficeNav`). Cada página confere o papel de novo com `requireRole("admin", ...)`.
- **Seções**: a lista fica em `src/modules/backoffice/features/shell/backoffice-sections.ts`. Uma seção
  nova é uma linha nessa lista e uma página em `src/app/(app)/admin/<secao>/`.
- **Conteúdo de cada seção** vem do módulo dono, pelo `index.ts` público (ex.: a fila de revisão de
  parceiros vem de `partners`). O módulo `backoffice` não acessa tabelas de outros módulos.
- Seções ainda sem slice mostram "Em breve" com o que vão ter (`backoffice-placeholder.tsx`).

| Seção | Rota | Slice |
|---|---|---|
| Usuários | `/admin/usuarios` | #24 |
| Parceiros | `/admin/parceiros` | #26, #28, #144 |
| Conteúdo | `/admin/conteudo` | #142, #143 |
| Leads | `/admin/leads` | #147 a #151 |
| Financeiro | `/admin/financeiro` | #152 a #156 |
| Métricas | `/admin/metricas` | #145 |
| Auditoria | `/admin/auditoria` | #146 |

## Conteúdo (#142)

- `/admin/conteudo?tipo=lugares|eventos|missoes&q=`: abas e busca por nome, sem JavaScript (links e formulário GET).
  Lugares pedem pelo menos 2 letras; eventos e missões listam os 50 mais recentes quando a busca está vazia.
- A lista do admin mostra **tudo**: eventos passados e cancelados, missões encerradas e surpresa, e o conteúdo
  de parceiros suspensos. Vem das APIs públicas `eventsForAdmin`, `missionsForAdmin` e `searchPlacesByName`.
- A edição reaproveita os formulários e os casos de uso dos módulos donos, que já aceitam admin (e a RLS também).
  Eventos cancelados ou encerrados e missões encerradas não são editáveis, como no portal do parceiro.
- Depois de salvar, o formulário volta para o backoffice (`returnTo="admin"`, um valor fixo, nunca um caminho
  vindo do formulário).

## Cadastrar estabelecimento (#143)

- `/admin/conteudo/lugares/novo`: nome, categoria, endereço, contato e coordenada (latitude e longitude, dentro
  de Joinville; aceita vírgula decimal). O lugar entra na lista pública e no mapa na hora.
- O lugar nasce com origem `admin` e `created_by`, sem responsável: um parceiro pode reivindicá-lo depois (#28).
  A reimportação do OpenStreetMap não o altera.
- Depois de cadastrar, o admin cai na edição para informar o horário de funcionamento.
- No banco, só admin insere, só com origem `admin` e em seu próprio nome (RLS + grant por coluna).

## Auditoria (#146)

- `backoffice.audit_log` guarda **quem, o quê, em quê e quando**: só ids, nenhum dado pessoal nem conteúdo.
  A tabela é append-only (uma trigger recusa UPDATE e DELETE) e fica fora da API.
- **Como entra:** os módulos não chamam o backoffice. Cada ação administrativa publica um evento de domínio com
  quem agiu, e o backoffice assina os que estão no catálogo `features/audit-log/audit-events.ts`. Uma ação nova
  é uma linha nesse catálogo. A gravação é idempotente pelo id do evento.
- **Hoje são registradas:** aprovar, recusar, suspender e reativar parceiro; aprovar e recusar vínculo com lugar;
  cadastrar estabelecimento; e editar lugar, editar ou cancelar evento e editar ou encerrar missão **de outra pessoa**.
- `/admin/auditoria`: filtros por período (7, 30 ou 90 dias), ação e pessoa, com as 100 ações mais recentes.
- **Limitação:** o bus de eventos é in-process. Se o processo cair entre a ação e a gravação, o registro se perde;
  a evolução prevista é o outbox (`docs/architecture.md`).

## Métricas gerais (#145)

- `/admin/metricas?periodo=7|30|90`: novos usuários, parceiros aprovados, eventos publicados, missões concluídas e
  lives transmitidas no período, com a variação contra o período anterior de mesma duração (texto e ícone, nunca só cor)
  e a mesma informação em tabela. Usuários e parceiros mostram também o total de hoje.
- Cada número vem da API pública do módulo dono (`userCounts`, `partnerCounts`, `eventCounts`,
  `missionCompletionCounts`, `liveCounts`): só contagens, sem dados pessoais e sem join entre schemas.
- Não há gráfico por dia; as visualizações e os favoritos por entidade continuam no painel do promotor (#78).
