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
