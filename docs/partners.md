# Parceiros (estabelecimentos e promotores)

## Fluxo de cadastro (#26)

```
/parceiro  →  formulário  →  "Cadastro em análise"  →  admin em /admin/parceiros
                                                        ├─ Aprovar → papel `partner` concedido → portal liberado
                                                        └─ Recusar (motivo obrigatório) → pessoa vê o motivo, corrige e reenvia
```

- **Dados:** tipo (estabelecimento ou promotor), nome do negócio, telefone com DDD, Instagram
  (opcional, aceita `@usuario` ou link) e CNPJ (opcional, validado pelos dígitos verificadores; a Receita
  não é consultada), além de uma descrição. Ficam em `partners.partners`; na POC, uma conta = um parceiro.
- **Status:** `pending` → `approved` | `rejected`. Editar ou reenviar sempre volta para `pending`.

## Segurança (três camadas)

1. **Páginas:** `/admin/parceiros` usa `requireRole("admin")` (404 para os demais).
2. **Actions e casos de uso:** `withRole("admin")` na action e `isAdmin` conferido de novo em
   `ApprovePartner` e `RejectPartner`.
3. **Banco (RLS):** o repositório roda tudo com `asUser`. As políticas garantem que:
   - cada pessoa só **lê e edita o próprio** cadastro, e só enquanto não está aprovado;
   - **ninguém se aprova** (o dono só consegue gravar `status = 'pending'`);
   - só admin muda o status, e **recusa sem motivo** é barrada por `check`.

Tudo isso é coberto por testes de integração (`postgres-partner-repository.int.test.ts`).

## Integração entre módulos

- Aprovar concede o papel pela **API pública do identity** (`grantRole`), sem tocar nas tabelas dele.
  A operação é **idempotente**: se algo falhar no meio, aprovar de novo completa o processo.
- A fila mostra nome e e-mail de quem pediu via `usersByIds` (API pública do identity).
- Evento publicado: `partners.PartnerApproved { partnerId, userId }` (para analytics/notificações futuras).

## Próximos slices

- #27 estrutura do portal: ✅ `/parceiro/(inicio|lugares|eventos|live|missoes|dados)`, protegida por `requirePartner` (sem sessão → login; sem papel/cadastro aprovado → `/parceiro`). As seções vivem em `features/portal/portal-sections.ts` (arquivo comum, sem "use client", porque páginas de servidor também usam);
- #28 reivindicar lugar: ✅ (abaixo).

## Reivindicar e editar um lugar (#28)

```
/parceiro/lugares → busca o lugar → "É meu" → pedido pendente → admin aprova em /admin/parceiros
   → evento partners.PlaceClaimApproved → módulo places marca managed_by → parceiro edita em /parceiro/lugares/<id>/editar
```

- **Pedidos** em `partners.place_claims` (RLS): o parceiro aprovado só vê e pede os próprios; só admin revisa;
  recusa exige motivo. **Um lugar, um dono**: índice único em `place_id` para pedidos aprovados.
- **Desacoplamento:** `partners` consulta lugares pela API pública de `places` (busca e resumo). A aprovação
  publica `partners.PlaceClaimApproved`, e `places` **assina o evento** (registrado em `src/bootstrap`) e
  marca o responsável. `places` não importa `partners`: a dependência vai num sentido só.
- **Edição pelo dono:** nome, categoria, endereço, telefone, site e horário (editor dia a dia, convertido
  para o formato do OSM, agrupando dias iguais). Grava com `asUser` e **RLS em `places.places`**: só o dono
  ou admin altera, e só as colunas liberadas (localização, origem e `managed_by` não podem ser alteradas).
  Salvar marca `edited_by_partner_at`, e a reimportação do OSM nunca sobrescreve.
- Lugar com responsável aparece como "Já tem responsável", sem revelar quem é.
