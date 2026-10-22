-- ============================================================================
-- FuelFlow v2 — Migração 004: TANQUE ACTIVO, TROCAS DE TANQUE E CICLOS (controlo de perdas)
--
-- Em cada lado, cada produto tem UM tanque activo de cada vez. As mangueiras desse lado e
-- produto tiram sempre do tanque activo. Quando o tanque chega ao lastro, regista-se uma
-- TROCA: contadores das mangueiras nesse momento + sobra medida na vareta.
-- Cada tanque tem CICLOS (de quando é ligado até ser desligado):
--   perda = (nível ao ligar + recepções no ciclo) − litros tirados pelas bombas − sobra medida
-- Pode ser corrida mais do que uma vez.
-- ============================================================================

alter table fuelflow.tanks add column if not exists lastro numeric(12,2) not null default 200;
alter table fuelflow.tanks add column if not exists estado text not null default 'parado';
do $$ begin
  alter table fuelflow.tanks add constraint tanks_estado_chk check (estado in ('activo','parado'));
exception when duplicate_object then null; end $$;
create unique index if not exists tanks_one_active on fuelflow.tanks (side_id, product_id) where estado = 'activo';

-- As mangueiras deixam de ter tanque fixo
update fuelflow.hoses set tank_id = null where tank_id is not null;

create table if not exists fuelflow.tank_switches (
  id          bigint generated always as identity primary key,
  side_id     bigint not null references fuelflow.sides(id),
  product_id  bigint not null references fuelflow.products(id),
  tank_from   bigint references fuelflow.tanks(id),
  tank_to     bigint not null references fuelflow.tanks(id),
  shift_id    bigint references fuelflow.shifts(id) on delete set null,
  feito_em    timestamptz not null default now(),
  sobra       numeric(12,2),            -- medida na vareta no tanque que parou
  litros_seg  numeric(14,2) not null default 0,  -- litros tirados do tanque que parou desde o último ponto do turno
  notas       text,
  created_by  uuid references fuelflow.profiles(id) on delete set null default auth.uid()
);

create table if not exists fuelflow.switch_readings (
  switch_id  bigint not null references fuelflow.tank_switches(id) on delete cascade,
  hose_id    bigint not null references fuelflow.hoses(id),
  leitura    numeric(14,2) not null,
  primary key (switch_id, hose_id)
);

create table if not exists fuelflow.tank_cycles (
  id                 bigint generated always as identity primary key,
  tank_id            bigint not null references fuelflow.tanks(id) on delete cascade,
  iniciado_em        timestamptz not null default now(),
  terminado_em       timestamptz,
  nivel_inicial      numeric(12,2) not null default 0,
  contadores_inicio  jsonb not null default '{}'::jsonb,   -- {hose_id: leitura}
  contadores_fim     jsonb,
  entradas           numeric(14,2),
  vendido            numeric(14,2),
  sobra              numeric(12,2),
  perda              numeric(14,2),      -- positivo = falta combustível
  switch_in          bigint references fuelflow.tank_switches(id) on delete set null,
  switch_out         bigint references fuelflow.tank_switches(id) on delete set null
);
create unique index if not exists tank_cycles_one_open on fuelflow.tank_cycles (tank_id) where terminado_em is null;

-- Saídas de stock por turno e tanque (para poder reabrir turnos)
create table if not exists fuelflow.tank_usage (
  id         bigint generated always as identity primary key,
  shift_id   bigint references fuelflow.shifts(id) on delete cascade,
  tank_id    bigint not null references fuelflow.tanks(id) on delete cascade,
  litros     numeric(14,2) not null,
  origem     text not null check (origem in ('fecho','troca')),
  switch_id  bigint references fuelflow.tank_switches(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Contadores actuais das mangueiras activas de um lado+produto, como {hose_id: leitura}
create or replace function fuelflow.current_counters(p_side_id bigint, p_product_id bigint)
returns jsonb language sql stable security definer set search_path = fuelflow as $$
  select coalesce(jsonb_object_agg(id::text, leitura_actual), '{}'::jsonb)
  from fuelflow.hoses where side_id = p_side_id and product_id = p_product_id and activo;
$$;

-- Último ponto de contagem de uma mangueira dentro de um turno (início ou última troca)
create or replace function fuelflow.hose_checkpoint(p_shift_id bigint, p_hose_id bigint)
returns numeric language sql stable security definer set search_path = fuelflow as $$
  select coalesce(
    (select sr.leitura from fuelflow.switch_readings sr join fuelflow.tank_switches s on s.id = sr.switch_id
      where s.shift_id = p_shift_id and sr.hose_id = p_hose_id order by s.feito_em desc, s.id desc limit 1),
    (select leitura_inicial from fuelflow.shift_readings where shift_id = p_shift_id and hose_id = p_hose_id),
    (select leitura_actual from fuelflow.hoses where id = p_hose_id));
$$;

-- Tanque novo: se não houver tanque activo para o lado+produto, fica activo e abre ciclo
create or replace function fuelflow.tank_auto_activate()
returns trigger language plpgsql security definer set search_path = fuelflow as $$
begin
  if new.activo and not exists (select 1 from fuelflow.tanks where side_id = new.side_id and product_id = new.product_id and estado = 'activo' and id <> new.id) then
    update fuelflow.tanks set estado = 'activo' where id = new.id;
    insert into fuelflow.tank_cycles (tank_id, nivel_inicial, contadores_inicio)
    values (new.id, new.nivel_actual, fuelflow.current_counters(new.side_id, new.product_id));
  end if;
  return null;
end $$;
drop trigger if exists tanks_auto_activate on fuelflow.tanks;
create trigger tanks_auto_activate after insert on fuelflow.tanks for each row execute function fuelflow.tank_auto_activate();

-- Mangueira nova (ou mudada de lado/produto): entra na contagem do ciclo do tanque activo
create or replace function fuelflow.hose_join_cycle()
returns trigger language plpgsql security definer set search_path = fuelflow as $$
begin
  update fuelflow.tank_cycles c set contadores_inicio = c.contadores_inicio || jsonb_build_object(new.id::text, new.leitura_actual)
  from fuelflow.tanks t
  where c.tank_id = t.id and c.terminado_em is null and t.estado = 'activo'
    and t.side_id = new.side_id and t.product_id = new.product_id
    and not c.contadores_inicio ? new.id::text;
  return null;
end $$;
drop trigger if exists hoses_join_cycle on fuelflow.hoses;
create trigger hoses_join_cycle after insert or update of side_id, product_id, activo on fuelflow.hoses
  for each row execute function fuelflow.hose_join_cycle();

-- Tanques que já existem: se for o único do lado+produto, fica activo com ciclo aberto
do $$
declare r record;
begin
  for r in select t.* from fuelflow.tanks t
           where t.activo and t.estado = 'parado'
             and not exists (select 1 from fuelflow.tanks x where x.side_id = t.side_id and x.product_id = t.product_id and x.estado = 'activo')
             and (select count(*) from fuelflow.tanks y where y.side_id = t.side_id and y.product_id = t.product_id and y.activo) = 1
  loop
    update fuelflow.tanks set estado = 'activo' where id = r.id;
    insert into fuelflow.tank_cycles (tank_id, nivel_inicial, contadores_inicio)
    values (r.id, r.nivel_actual, fuelflow.current_counters(r.side_id, r.product_id));
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- TROCAR (ou ligar) TANQUE
--   p_readings: [{"hose_id": 1, "leitura": 1234.5}, ...] — contadores no momento da troca.
--   Sem turno aberto no lado, usam-se os contadores actuais (não há vendas fora de turno).
-- ----------------------------------------------------------------------------
create or replace function fuelflow.switch_tank(p_side_id bigint, p_product_id bigint, p_tank_to bigint,
                                                p_sobra numeric, p_readings jsonb, p_notas text default null)
returns bigint language plpgsql security definer set search_path = fuelflow as $$
declare
  v_shift   fuelflow.shifts;
  v_from    fuelflow.tanks;
  v_to      fuelflow.tanks;
  v_switch  bigint;
  v_cycle   fuelflow.tank_cycles;
  v_counts  jsonb := '{}'::jsonb;
  v_h       record;
  v_val     numeric;
  v_chk     numeric;
  v_seg     numeric := 0;
  v_vend    numeric := 0;
  v_ent     numeric;
begin
  if not fuelflow.is_active() then raise exception 'Utilizador inactivo'; end if;
  perform 1 from fuelflow.sides where id = p_side_id for update;
  select * into v_shift from fuelflow.shifts where side_id = p_side_id and estado = 'aberto';
  if not fuelflow.is_admin() and (v_shift.id is null or v_shift.operador_id <> auth.uid()) then
    raise exception 'Só o operador com turno aberto neste lado (ou o admin) pode trocar o tanque';
  end if;

  select * into v_to from fuelflow.tanks where id = p_tank_to for update;
  if not found or v_to.side_id <> p_side_id or v_to.product_id <> p_product_id then raise exception 'Tanque de destino inválido'; end if;
  if not v_to.activo then raise exception 'O tanque % está desactivado', v_to.nome; end if;
  if v_to.estado = 'activo' then raise exception 'O tanque % já está a trabalhar', v_to.nome; end if;
  select * into v_from from fuelflow.tanks where side_id = p_side_id and product_id = p_product_id and estado = 'activo' for update;

  -- Contadores no momento da troca
  for v_h in select * from fuelflow.hoses where side_id = p_side_id and product_id = p_product_id and activo order by ordem, codigo loop
    if v_shift.id is not null and exists (select 1 from fuelflow.shift_readings where shift_id = v_shift.id and hose_id = v_h.id) then
      v_val := (select (x->>'leitura')::numeric from jsonb_array_elements(coalesce(p_readings, '[]'::jsonb)) x where (x->>'hose_id')::bigint = v_h.id limit 1);
      if v_val is null then raise exception 'Falta o contador da mangueira %', v_h.codigo; end if;
      v_chk := fuelflow.hose_checkpoint(v_shift.id, v_h.id);
      if v_val < v_chk then raise exception 'Contador de % (%) é menor que o último registado (%)', v_h.codigo, v_val, v_chk; end if;
      v_seg := v_seg + (v_val - v_chk);
    else
      v_val := v_h.leitura_actual;
    end if;
    v_counts := v_counts || jsonb_build_object(v_h.id::text, v_val);
  end loop;

  if v_from.id is not null then
    if p_sobra is null or p_sobra < 0 then raise exception 'Indica a sobra medida no tanque %', v_from.nome; end if;
  end if;

  insert into fuelflow.tank_switches (side_id, product_id, tank_from, tank_to, shift_id, sobra, litros_seg, notas)
  values (p_side_id, p_product_id, v_from.id, p_tank_to, v_shift.id, case when v_from.id is not null then p_sobra end, v_seg, p_notas)
  returning id into v_switch;
  insert into fuelflow.switch_readings (switch_id, hose_id, leitura)
  select v_switch, key::bigint, value::numeric from jsonb_each_text(v_counts);

  -- Fechar o ciclo do tanque que parou
  if v_from.id is not null then
    if v_seg > 0 then
      insert into fuelflow.tank_usage (shift_id, tank_id, litros, origem, switch_id) values (v_shift.id, v_from.id, v_seg, 'troca', v_switch);
    end if;
    select * into v_cycle from fuelflow.tank_cycles where tank_id = v_from.id and terminado_em is null for update;
    if v_cycle.id is not null then
      select coalesce(sum(greatest(0, (v_counts->>k)::numeric - (v_cycle.contadores_inicio->>k)::numeric)), 0) into v_vend
      from jsonb_object_keys(v_counts) k where v_cycle.contadores_inicio ? k;
      select coalesce(sum(quantidade), 0) into v_ent from fuelflow.tank_deliveries
      where tank_id = v_from.id and created_at >= v_cycle.iniciado_em;
      update fuelflow.tank_cycles set terminado_em = now(), contadores_fim = v_counts, entradas = v_ent, vendido = v_vend,
        sobra = p_sobra, perda = nivel_inicial + v_ent - v_vend - p_sobra, switch_out = v_switch
      where id = v_cycle.id;
    end if;
    update fuelflow.tanks set nivel_actual = p_sobra, estado = 'parado' where id = v_from.id;
  end if;

  -- Ligar o novo tanque e abrir o ciclo dele
  update fuelflow.tanks set estado = 'activo' where id = p_tank_to;
  insert into fuelflow.tank_cycles (tank_id, nivel_inicial, contadores_inicio, switch_in)
  values (p_tank_to, v_to.nivel_actual, v_counts, v_switch);

  return v_switch;
end $$;

-- ----------------------------------------------------------------------------
-- FECHAR TURNO: os litros desde o último ponto de cada mangueira saem do tanque activo
-- ----------------------------------------------------------------------------
create or replace function fuelflow.close_shift(p_shift_id bigint)
returns void language plpgsql security definer set search_path = fuelflow as $$
declare
  v_s    fuelflow.shifts;
  v_bad  text;
  v_t    record;
  v_u    record;
begin
  select * into v_s from fuelflow.shifts where id = p_shift_id for update;
  if not found then raise exception 'Turno não encontrado'; end if;
  if v_s.estado <> 'aberto' then raise exception 'O turno já está fechado'; end if;
  if not (fuelflow.is_admin() or (v_s.operador_id = auth.uid() and fuelflow.is_active())) then
    raise exception 'Sem permissão para fechar este turno';
  end if;

  select string_agg(h.codigo, ', ') into v_bad
  from fuelflow.shift_readings r join fuelflow.hoses h on h.id = r.hose_id
  where r.shift_id = p_shift_id and r.leitura_final is null;
  if v_bad is not null then raise exception 'Falta a leitura final: %', v_bad; end if;

  select string_agg(h.codigo, ', ') into v_bad
  from fuelflow.shift_readings r join fuelflow.hoses h on h.id = r.hose_id
  where r.shift_id = p_shift_id and r.leitura_final < fuelflow.hose_checkpoint(p_shift_id, r.hose_id);
  if v_bad is not null then raise exception 'Leitura final menor que a inicial ou que a da troca de tanque: %', v_bad; end if;

  update fuelflow.hoses h set leitura_actual = r.leitura_final
  from fuelflow.shift_readings r
  where r.shift_id = p_shift_id and r.hose_id = h.id;

  for v_u in
    select t.id tank_id, sum(r.leitura_final - fuelflow.hose_checkpoint(p_shift_id, r.hose_id)) litros
    from fuelflow.shift_readings r
    join fuelflow.tanks t on t.side_id = v_s.side_id and t.product_id = r.product_id and t.estado = 'activo'
    where r.shift_id = p_shift_id
    group by t.id
  loop
    if v_u.litros > 0 then
      insert into fuelflow.tank_usage (shift_id, tank_id, litros, origem) values (p_shift_id, v_u.tank_id, v_u.litros, 'fecho');
      update fuelflow.tanks set nivel_actual = nivel_actual - v_u.litros where id = v_u.tank_id;
    end if;
  end loop;

  select * into v_t from fuelflow.shift_totals(p_shift_id);
  update fuelflow.shifts set
    estado = 'fechado', fechado_em = now(),
    total_bomba = v_t.total_bomba, total_outras = v_t.total_outras, total_credito = v_t.total_credito,
    total_esperado = v_t.total_esperado, total_declarado = v_t.total_declarado, diferenca = v_t.diferenca
  where id = p_shift_id;
end $$;

-- REABRIR: repõe o que o fecho tirou dos tanques (as trocas registadas ficam)
create or replace function fuelflow.reopen_shift(p_shift_id bigint)
returns void language plpgsql security definer set search_path = fuelflow as $$
declare
  v_s   fuelflow.shifts;
  v_bad text;
begin
  if not fuelflow.is_admin() then raise exception 'Apenas o admin pode reabrir turnos'; end if;
  select * into v_s from fuelflow.shifts where id = p_shift_id for update;
  if v_s.estado = 'aberto' then raise exception 'O turno já está aberto'; end if;
  if exists (select 1 from fuelflow.shifts where operador_id = v_s.operador_id and estado = 'aberto') then
    raise exception 'O operador já tem outro turno aberto';
  end if;
  if exists (select 1 from fuelflow.shifts where side_id = v_s.side_id and estado = 'aberto') then
    raise exception 'Já há outro turno aberto neste lado';
  end if;
  select string_agg(h.codigo, ', ') into v_bad
  from fuelflow.shift_readings r join fuelflow.hoses h on h.id = r.hose_id
  where r.shift_id = p_shift_id and h.leitura_actual <> r.leitura_final;
  if v_bad is not null then
    raise exception 'Já houve turnos depois deste nas mangueiras: %. Não é possível reabrir.', v_bad;
  end if;
  if exists (select 1 from fuelflow.tank_switches where side_id = v_s.side_id and feito_em > v_s.fechado_em) then
    raise exception 'Houve uma troca de tanque depois deste turno. Não é possível reabrir.';
  end if;

  update fuelflow.tanks t set nivel_actual = t.nivel_actual + u.litros
  from (select tank_id, sum(litros) litros from fuelflow.tank_usage where shift_id = p_shift_id and origem = 'fecho' group by tank_id) u
  where t.id = u.tank_id;
  delete from fuelflow.tank_usage where shift_id = p_shift_id and origem = 'fecho';

  update fuelflow.hoses h set leitura_actual = r.leitura_inicial
  from fuelflow.shift_readings r
  where r.shift_id = p_shift_id and r.hose_id = h.id;

  update fuelflow.shifts set estado = 'aberto', fechado_em = null, validado_por = null, validado_em = null
  where id = p_shift_id;
end $$;

-- ACERTAR CONTADORES: contador trocado/reiniciado → os ciclos abertos acompanham a diferença
create or replace function fuelflow.set_hose_counters(p_items jsonb)
returns void language plpgsql security definer set search_path = fuelflow as $$
declare
  v_item jsonb;
  v_busy text;
  v_old  numeric;
  v_new  numeric;
  v_hid  text;
begin
  if not fuelflow.is_admin() then raise exception 'Apenas o admin pode alterar contadores'; end if;
  select string_agg(h.codigo, ', ') into v_busy
  from fuelflow.shift_readings r
  join fuelflow.shifts s on s.id = r.shift_id and s.estado = 'aberto'
  join fuelflow.hoses h on h.id = r.hose_id
  where r.hose_id in (select (x->>'id')::bigint from jsonb_array_elements(p_items) x);
  if v_busy is not null then raise exception 'Fecha primeiro o turno aberto destas mangueiras: %', v_busy; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_new := (v_item->>'leitura')::numeric;
    v_hid := v_item->>'id';
    if v_new < 0 then raise exception 'Contador inválido'; end if;
    select leitura_actual into v_old from fuelflow.hoses where id = v_hid::bigint;
    update fuelflow.hoses set leitura_actual = v_new where id = v_hid::bigint;
    update fuelflow.tank_cycles set contadores_inicio = jsonb_set(contadores_inicio, array[v_hid],
        to_jsonb((contadores_inicio->>v_hid)::numeric + (v_new - v_old)))
    where terminado_em is null and contadores_inicio ? v_hid;
  end loop;
end $$;

-- Ciclo em curso de cada tanque activo: quanto já saiu pelas bombas
create or replace view fuelflow.tank_cycle_status with (security_invoker = true) as
select c.*, t.nome tank_nome, t.side_id, t.product_id, t.nivel_actual, t.lastro, t.capacidade,
       (select coalesce(sum(greatest(0, h.leitura_actual - (c.contadores_inicio->>h.id::text)::numeric)), 0)
          from fuelflow.hoses h where c.contadores_inicio ? h.id::text) as vendido_ate_agora
from fuelflow.tank_cycles c join fuelflow.tanks t on t.id = c.tank_id;

-- Segurança
alter table fuelflow.tank_switches   enable row level security;
alter table fuelflow.switch_readings enable row level security;
alter table fuelflow.tank_cycles     enable row level security;
alter table fuelflow.tank_usage      enable row level security;
drop policy if exists switches_read on fuelflow.tank_switches;
drop policy if exists switches_admin on fuelflow.tank_switches;
drop policy if exists switch_readings_read on fuelflow.switch_readings;
drop policy if exists cycles_admin on fuelflow.tank_cycles;
drop policy if exists usage_admin on fuelflow.tank_usage;
create policy switches_read  on fuelflow.tank_switches for select using (fuelflow.is_admin() or fuelflow.can_see_shift(shift_id));
create policy switches_admin on fuelflow.tank_switches for update using (fuelflow.is_admin()) with check (fuelflow.is_admin());
create policy switch_readings_read on fuelflow.switch_readings for select using (
  exists (select 1 from fuelflow.tank_switches s where s.id = switch_id and (fuelflow.is_admin() or fuelflow.can_see_shift(s.shift_id))));
create policy cycles_admin on fuelflow.tank_cycles for select using (fuelflow.is_admin());
create policy usage_admin  on fuelflow.tank_usage  for select using (fuelflow.is_admin());

grant select on fuelflow.tank_switches, fuelflow.switch_readings, fuelflow.tank_cycles, fuelflow.tank_usage, fuelflow.tank_cycle_status to authenticated;
grant update (notas) on fuelflow.tank_switches to authenticated;
revoke insert, delete, update on fuelflow.tank_cycles, fuelflow.tank_usage, fuelflow.switch_readings from authenticated, anon;
revoke all on fuelflow.tank_switches, fuelflow.switch_readings, fuelflow.tank_cycles, fuelflow.tank_usage, fuelflow.tank_cycle_status from anon;

revoke execute on function fuelflow.switch_tank(bigint, bigint, bigint, numeric, jsonb, text), fuelflow.current_counters(bigint, bigint),
  fuelflow.hose_checkpoint(bigint, bigint), fuelflow.tank_auto_activate(), fuelflow.hose_join_cycle(), fuelflow.close_shift(bigint), fuelflow.reopen_shift(bigint),
  fuelflow.set_hose_counters(jsonb) from public, anon;
grant execute on function fuelflow.switch_tank(bigint, bigint, bigint, numeric, jsonb, text), fuelflow.hose_checkpoint(bigint, bigint),
  fuelflow.close_shift(bigint), fuelflow.reopen_shift(bigint), fuelflow.set_hose_counters(jsonb) to authenticated;

notify pgrst, 'reload schema';
