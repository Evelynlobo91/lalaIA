## Resumo
<!-- O que este PR entrega e por quê. Um slice por PR. -->

Closes #

## Como testar
```bash
npm run check
```

## Definition of Done
- [ ] Critérios de aceite da issue atendidos (sem escopo extra)
- [ ] Testes do caso de uso, incluindo os casos de erro
- [ ] Entrada validada com zod; erros tratados e logados
- [ ] `npm run check` passando (lint de fronteiras, typecheck, testes)
- [ ] `npm run test:int` passando, se tocou banco/migrations
- [ ] Responsivo (mobile-first), se tem UI
- [ ] Documentação atualizada (`docs/`), se mudou convenção ou arquitetura

## Segurança e LGPD
- [ ] Nenhum segredo no código ou no commit
- [ ] Autorização verificada no servidor
- [ ] Erros não vazam detalhes internos
- [ ] Dados pessoais minimizados (logs, eventos, analytics)
- [ ] Novas tabelas com `revoke` de `anon`/`authenticated` (ou RLS, se expostas)
