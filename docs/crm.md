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

## Anotações e follow-ups (#149)

- **Anotações** (`crm.lead_notes`): registro de cada contato, com autor e data. Não são editadas nem apagadas.
- **Próximo passo** (`crm.lead_follow_ups`): o que fazer e até que dia. Cada lead tem no máximo um em aberto;
  definir de novo troca o que estava. A data não pode estar no passado.
- **"Meus follow-ups de hoje"** (`/admin/leads/follow-ups`): os de hoje e os atrasados, dos leads sob a
  responsabilidade de quem está logado, com atalho para concluir. A contagem aparece no botão da lista de leads.
- **Datas** são dias de calendário de Joinville (`America/Sao_Paulo`), sem hora: "hoje" muda à meia-noite local.

## Converter em parceiro (#150)

1. Na página do lead (etapa aberta), o comercial completa o que o cadastro de parceiro exige e o lead não tem
   (tipo, telefone do negócio, descrição e, se quiser, o lugar) e **gera o link de convite**.
2. Ele envia o link para a pessoa de contato (WhatsApp, e-mail...). O link vale 14 dias e aparece uma vez; gerar
   outro invalida o anterior. No banco fica só o hash do token (`crm.partner_invites`).
3. A pessoa abre o link, entra ou cria a conta, e **aceita**. Ela vira parceira **já aprovada** com os dados do lead,
   sem preencher o cadastro de novo; o lugar é vinculado, se ainda não tiver outro responsável.
4. O lead vai para **parceiro ativo**, com o registro no histórico.

- O parceiro é criado pela API pública do módulo partners (`activatePartner`), que é idempotente: aceitar de novo
  com a mesma conta não cria um segundo parceiro, e um cadastro suspenso não é reativado por aqui.
- A aceitação roda como operação do sistema (fora da RLS): quem aceita não é do time, e a autorização é o token.
- **Limitação:** o app não envia o convite por e-mail; o link é copiado e enviado pela pessoa do comercial.
