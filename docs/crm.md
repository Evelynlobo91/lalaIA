# CRM de leads (`crm`)

Captação de estabelecimentos e promotores (Epic #86). Funil: **lead → contato → proposta → parceiro ativo**, ou
**perdido** (com motivo). As telas ficam em `/admin/leads`.

## Cadastro de lead (#147)

- Lead: estabelecimento, contato (nome e telefone ou e-mail, pelo menos um), origem (Instagram, indicação, visita,
  outro) e responsável.
- **Responsável** é alguém do time com a capacidade `leads:write` (Comercial ou Admin). Quem cadastra já vem
  selecionado. Se a conta do responsável for excluída, o lead fica "Sem responsável".
- **Acesso por capacidade (#157):** `leads:read` para ver, `leads:write` para cadastrar e editar. Três camadas:
  página (404 sem a capacidade), action e banco (RLS em `crm.leads` com `authz.has_capability`).
- **LGPD:** o lead guarda nome, telefone e e-mail de uma pessoa de contato. O acesso é restrito ao time comercial;
  o prazo de retenção de leads perdidos ainda precisa ser definido com o jurídico.
