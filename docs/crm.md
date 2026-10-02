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

## Funil e histórico (#148)

- `/admin/leads/funil`: uma coluna por etapa, com a contagem. Para mover, a pessoa escolhe a etapa no próprio card
  e confirma; não há arrastar, então funciona por teclado e no celular.
- **Regras** (`domain/pipeline.ts`): etapa aberta (lead, contato, proposta) vai para qualquer outra aberta ou para
  **perdido**, que exige motivo; perdido pode ser reaberto; ninguém vai para **parceiro ativo** à mão (isso é a
  conversão, #150); lead ativo não se move.
- **Histórico** (`crm.lead_stage_history`, append-only): de, para, quem, quando e o motivo da perda. A mudança de
  etapa e o registro acontecem na mesma transação. Aparece na página do lead.
- **Duas pessoas ao mesmo tempo:** a mudança só vale se o lead ainda estiver na etapa em que a pessoa o viu; senão,
  ela recebe um aviso para atualizar a página, em vez de sobrescrever a mudança da outra.
