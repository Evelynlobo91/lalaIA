-- live: disparo manual de CTA (#93, slice #181). Durante a live, o parceiro solta uma chamada agora, por alguns
-- minutos, sem depender do agendamento. Enquanto vale, ela passa na frente das programadas.
alter table live.ctas
  add column triggered_at timestamptz,
  add column triggered_until timestamptz,
  add constraint ctas_trigger_shape check (
    (triggered_at is null and triggered_until is null)
    or (triggered_until > triggered_at and triggered_until <= triggered_at + interval '60 minutes')
  );

-- Como usuário (RLS "dono altera os próprios"), o disparo é só estas duas colunas.
grant update (triggered_at, triggered_until) on live.ctas to authenticated;
