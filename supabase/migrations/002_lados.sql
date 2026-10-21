-- ============================================================================
-- FuelFlow v2 — Migração 002: LADOS (Lado A / Lado B)
--
-- Cada lado tem as suas bombas, mangueiras e tanques, e o seu próprio fecho de turno.
-- Um operador por lado: só pode haver um turno aberto em cada lado.
-- Pode ser corrida mais do que uma vez sem estragar nada.
-- ============================================================================

create table if not exists fuelflow.sides (
  id          bigint generated always as identity primary key,
  nome        text not null unique,
  ordem       int not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into fuelflow.sides (nome, ordem)
select v.nome, v.ordem from (values ('Lado A', 1), ('Lado B', 2)) v(nome, ordem)
where not exists (select 1 from fuelflow.sides s where s.nome = v.nome);

alter table fuelflow.tanks  add column if not exists side_id bigint references fuelflow.sides(id);
alter table fuelflow.hoses  add column if not exists side_id bigint references fuelflow.sides(id);
alter table fuelflow.shifts add column if not exists side_id bigint references fuelflow.sides(id);

-- O que já existe fica no Lado A
update fuelflow.tanks  set side_id = (select id from fuelflow.sides where nome = 'Lado A') where side_id is null;
update fuelflow.hoses  set side_id = (select id from fuelflow.sides where nome = 'Lado A') where side_id is null;
update fuelflow.shifts set side_id = (select id from fuelflow.sides where nome = 'Lado A') where side_id is null;

alter table fuelflow.tanks  alter column side_id set not null;
alter table fuelflow.hoses  alter column side_id set not null;
alter table fuelflow.shifts alter column side_id set not null;

create unique index if not exists shifts_one_open_per_side on fuelflow.shifts (side_id) where estado = 'aberto';

-- Uma mangueira só pode ligar a um tanque do mesmo lado e do mesmo produto
create or replace function fuelflow.check_hose_tank()
returns trigger language plpgsql security definer set search_path = fuelflow as $$
declare v_t fuelflow.tanks;
begin
  if new.tank_id is not null then
    select * into v_t from fuelflow.tanks where id = new.tank_id;
    if v_t.side_id <> new.side_id then raise exception 'O tanque % é de outro lado', v_t.nome; end if;
    if v_t.product_id <> new.product_id then raise exception 'O tanque % é de outro produto', v_t.nome; end if;
  end if;
  return new;
end $$;

drop trigger if exists hoses_check_tank on fuelflow.hoses;
create trigger hoses_check_tank before insert or update of tank_id, side_id, product_id on fuelflow.hoses
  for each row execute function fuelflow.check_hose_tank();

-- Abrir turno num lado: todas as mangueiras activas desse lado, com as leituras herdadas
drop function if exists fuelflow.open_shift(bigint[]);
create or replace function fuelflow.open_shift(p_side_id bigint)
returns bigint language plpgsql security definer set search_path = fuelflow as $$
declare
  v_shift bigint;
  v_side  fuelflow.sides;
  v_who   text;
begin
  if not fuelflow.is_active() then raise exception 'Utilizador inactivo'; end if;
  select * into v_side from fuelflow.sides where id = p_side_id and activo for update;
  if not found then raise exception 'Lado não encontrado'; end if;
  if exists (select 1 from fuelflow.shifts where operador_id = auth.uid() and estado = 'aberto') then
    raise exception 'Já tens um turno aberto';
  end if;
  select p.nome into v_who from fuelflow.shifts s join fuelflow.profiles p on p.id = s.operador_id
  where s.side_id = p_side_id and s.estado = 'aberto';
  if found then raise exception 'O % já tem um turno aberto (%)', v_side.nome, v_who; end if;
  if not exists (select 1 from fuelflow.hoses where side_id = p_side_id and activo) then
    raise exception 'O % não tem mangueiras activas', v_side.nome;
  end if;

  insert into fuelflow.shifts (operador_id, side_id) values (auth.uid(), p_side_id) returning id into v_shift;

  insert into fuelflow.shift_readings (shift_id, hose_id, product_id, preco, leitura_inicial)
  select v_shift, h.id, h.product_id, p.preco, h.leitura_actual
  from fuelflow.hoses h join fuelflow.products p on p.id = h.product_id
  where h.side_id = p_side_id and h.activo
  order by h.ordem, h.codigo;

  return v_shift;
end $$;

-- Reabrir: também não pode haver outro turno aberto no mesmo lado
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

  update fuelflow.tanks t set nivel_actual = t.nivel_actual + x.litros
  from (select h.tank_id, sum(r.litros) litros
        from fuelflow.shift_readings r join fuelflow.hoses h on h.id = r.hose_id
        where r.shift_id = p_shift_id and h.tank_id is not null
        group by h.tank_id) x
  where t.id = x.tank_id;

  update fuelflow.hoses h set leitura_actual = r.leitura_inicial
  from fuelflow.shift_readings r
  where r.shift_id = p_shift_id and r.hose_id = h.id;

  update fuelflow.shifts set estado = 'aberto', fechado_em = null, validado_por = null, validado_em = null
  where id = p_shift_id;
end $$;

-- Estado dos lados para o ecrã do operador (quem está em cada lado)
create or replace function fuelflow.side_status()
returns table (side_id bigint, nome text, mangueiras bigint, turno_id bigint, operador text, aberto_em timestamptz, meu boolean)
language sql stable security definer set search_path = fuelflow as $$
  select s.id, s.nome,
         (select count(*) from fuelflow.hoses h where h.side_id = s.id and h.activo),
         sh.id, p.nome, sh.aberto_em, sh.operador_id = auth.uid()
  from fuelflow.sides s
  left join fuelflow.shifts sh on sh.side_id = s.id and sh.estado = 'aberto'
  left join fuelflow.profiles p on p.id = sh.operador_id
  where s.activo and fuelflow.is_active()
  order by s.ordem, s.nome;
$$;

-- Acertar contadores (admin): define o contador de várias mangueiras de uma vez
create or replace function fuelflow.set_hose_counters(p_items jsonb)
returns void language plpgsql security definer set search_path = fuelflow as $$
declare
  v_item jsonb;
  v_busy text;
begin
  if not fuelflow.is_admin() then raise exception 'Apenas o admin pode alterar contadores'; end if;
  select string_agg(h.codigo, ', ') into v_busy
  from fuelflow.shift_readings r
  join fuelflow.shifts s on s.id = r.shift_id and s.estado = 'aberto'
  join fuelflow.hoses h on h.id = r.hose_id
  where r.hose_id in (select (x->>'id')::bigint from jsonb_array_elements(p_items) x);
  if v_busy is not null then raise exception 'Fecha primeiro o turno aberto destas mangueiras: %', v_busy; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item->>'leitura')::numeric < 0 then raise exception 'Contador inválido'; end if;
    update fuelflow.hoses set leitura_actual = (v_item->>'leitura')::numeric where id = (v_item->>'id')::bigint;
  end loop;
end $$;

alter table fuelflow.sides enable row level security;
drop policy if exists sides_read on fuelflow.sides;
drop policy if exists sides_admin on fuelflow.sides;
create policy sides_read  on fuelflow.sides for select using (fuelflow.is_active());
create policy sides_admin on fuelflow.sides for all using (fuelflow.is_admin()) with check (fuelflow.is_admin());

grant all on fuelflow.sides to authenticated, service_role;
revoke execute on function fuelflow.open_shift(bigint), fuelflow.side_status(), fuelflow.set_hose_counters(jsonb),
  fuelflow.check_hose_tank(), fuelflow.reopen_shift(bigint) from public, anon;
grant execute on function fuelflow.open_shift(bigint), fuelflow.side_status(), fuelflow.set_hose_counters(jsonb),
  fuelflow.reopen_shift(bigint) to authenticated;

notify pgrst, 'reload schema';
