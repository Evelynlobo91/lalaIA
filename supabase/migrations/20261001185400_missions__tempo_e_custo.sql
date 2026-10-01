-- missions: tempo estimado e gasto por pessoa (#64, RF27), para recomendar missões que cabem no tempo
-- disponível e no orçamento. Opcionais: sem tempo, vale a estimativa por etapas; sem custo, "não informado".
alter table missions.missions
  add column estimated_minutes smallint check (estimated_minutes between 10 and 600),
  add column cost_cents integer check (cost_cents between 0 and 100000);

comment on column missions.missions.estimated_minutes is 'Tempo estimado para concluir a missão, em minutos (null = estimado pelas etapas).';
comment on column missions.missions.cost_cents is 'Gasto estimado por pessoa, em centavos (0 = grátis; null = não informado).';

grant update (estimated_minutes, cost_cents) on missions.missions to authenticated;
