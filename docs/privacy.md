# Privacidade e LGPD (#25)

Tudo em `/perfil/privacidade` (link no perfil). Slice `src/modules/identity/features/lgpd/`.

## Consentimentos granulares e revogáveis

| Consentimento | O que muda quando a pessoa desliga |
|---------------|------------------------------------|
| **Métricas de uso** (`analytics`) | As visualizações deste navegador não são enviadas (`TrackView`) nem gravadas (o `POST /api/analytics/track` ignora com o cookie). Favoritos, "Quero ir" e check-ins dela deixam de entrar nas métricas (o Analytics consulta `allowsAnalytics(userId)` antes de gravar). |
| **Localização** (`geolocation`) | O botão "Perto de mim" não pede o GPS e explica como reativar. |

- Gravados em `identity.consents` (uma linha por pessoa; sem linha = padrões ligados, pois as métricas já são
  anônimas e o GPS é sempre pedido pelo navegador). Revogar = desmarcar e salvar; vale na hora.
- Espelhados nos cookies de preferência `lalaia-analytics` e `lalaia-geo` (`0`/`1`, 1 ano, `SameSite=Lax`), lidos
  no navegador. Não são `httpOnly` de propósito: não carregam segredo.

## Exportação (portabilidade)

- `GET /api/me/export` (só logado; 401 sem sessão): download `lalaia-meus-dados-AAAA-MM-DD.json` com cadastro,
  perfil, preferências, consentimentos, termos, papéis, favoritos, missões, XP, cadastro de parceiro, lugares,
  eventos, missões criadas e transmissões (**nunca a chave da transmissão**).
- Cada módulo é uma `PersonalDataSource`, montada em `src/bootstrap/personal-data-sources.ts` pelas APIs
  públicas (o identity não depende dos outros módulos). Uma fonte fora do ar não derruba a exportação: a parte
  vem marcada como indisponível.

## Exclusão de conta

1. Confirmação digitada (**EXCLUIR**).
2. Publica `identity.UserDeleted { userId }` **antes** de apagar. Assinantes:
   - **live**: desliga no provedor todas as transmissões da pessoa (senão a chave continuaria aceitando vídeo).
   - **analytics**: nada a fazer (as métricas não guardam quem fez).
3. Apaga a foto no Storage (melhor-esforço) e a conta em `auth.users`. O resto sai em **cascata**: perfil,
   preferências, consentimentos, termos, papéis, favoritos, missões (aceitas e criadas), XP, cadastro de
   parceiro, eventos, transmissões e aceite das diretrizes. Lugares do OpenStreetMap que ela gerenciava
   continuam no app, sem responsável.
4. Encerra a sessão e volta para a home com a confirmação.

Falha de um módulo no passo 2 é isolada pelo bus (logada) e não impede a exclusão: o direito da pessoa vem
primeiro.

## Pendências (jurídico)

- Página pública de política de privacidade e termos (texto revisado pelo jurídico).
- Prazo de retenção dos logs e das métricas anônimas.
