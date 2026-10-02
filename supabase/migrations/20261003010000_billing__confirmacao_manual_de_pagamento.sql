-- billing: confirmação manual de pagamento pelo time financeiro (piloto sem gateway real). A confirmação usa o
-- mesmo caminho do webhook de "pago" (billing.payment_events, com o id `manual:<fatura>`); aqui só entra o novo
-- alvo na trilha de auditoria, que guarda QUEM confirmou.
alter table backoffice.audit_log drop constraint audit_log_target_type_check;
alter table backoffice.audit_log add constraint audit_log_target_type_check
  check (target_type in ('partner', 'place_claim', 'place', 'event', 'mission', 'user', 'live_cta', 'chat_message', 'invoice'));
