-- live: ações automáticas do sistema no log de ciclo de vida (ex.: evento cancelado encerra a live dele).
-- Só o backend grava com source = 'system': a política de insert do usuário continua exigindo 'partner'.
alter table live.stream_lifecycle_events drop constraint stream_lifecycle_events_source_check;
alter table live.stream_lifecycle_events add constraint stream_lifecycle_events_source_check
  check (source in ('provider', 'partner', 'system'));
