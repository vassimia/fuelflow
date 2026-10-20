-- ============================================================================
-- FuelFlow v2 — Base de dados (Supabase / PostgreSQL)
--
-- Tudo fica no schema "fuelflow", separado das tabelas do app antigo (schema "public").
-- Como usar: Supabase → SQL Editor → New query → colar este ficheiro inteiro → Run
-- Depois: Project Settings → Data API → Exposed schemas → acrescentar "fuelflow" → Save
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists fuelflow;
grant usage on schema fuelflow to anon, authenticated, service_role;
alter default privileges in schema fuelflow grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema fuelflow grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema fuelflow grant execute on functions to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 0. DADOS DA EMPRESA (aparecem nas faturas e extratos)
-- ----------------------------------------------------------------------------
create table fuelflow.app_settings (
  id                int primary key default 1 check (id = 1),
  empresa           text not null default 'Estação de Serviço Quelimane, Lda.',
  nuit              text default '',
  endereco          text default 'Av. Heróis da Libertação Nacional, Quelimane',
  contacto          text default '',
  email             text default '',
  dados_bancarios   text default '',
  rodape            text default 'Preços com IVA incluído.',
  updated_at        timestamptz not null default now()
);
insert into fuelflow.app_settings (id) values (1);

-- ----------------------------------------------------------------------------
-- 1. UTILIZADORES (perfis ligados ao Supabase Auth)
--    O PRIMEIRO utilizador registado fica admin e activo.
--    Os seguintes ficam operadores INACTIVOS até o admin os activar.
-- ----------------------------------------------------------------------------
create table fuelflow.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null default '',
  username    text unique,
  email       text,
  role        text not null default 'operador' check (role in ('admin','operador')),
  activo      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Contas que já existiam no Supabase (do app antigo) não entram no FuelFlow v2 sozinhas:
-- só as novas contas criam perfil aqui. Para usar uma conta antiga como admin, ver admin.sql.
create or replace function fuelflow.handle_new_user()
returns trigger language plpgsql security definer set search_path = fuelflow as $$
declare
  v_first boolean;
begin
  perform pg_advisory_xact_lock(778899);
  select not exists (select 1 from fuelflow.profiles where role = 'admin' and activo) into v_first;
  insert into fuelflow.profiles (id, nome, username, email, role, activo)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nome',''), split_part(new.email,'@',1)),
    lower(coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1))),
    new.email,
    case when v_first then 'admin' else 'operador' end,
    v_first
  );
  return new;
end $$;

create trigger fuelflow_on_auth_user_created
  after insert on auth.users
  for each row execute function fuelflow.handle_new_user();

create or replace function fuelflow.is_admin()
returns boolean language sql stable security definer set search_path = fuelflow as $$
  select exists (select 1 from fuelflow.profiles where id = auth.uid() and role = 'admin' and activo);
$$;

create or replace function fuelflow.is_active()
returns boolean language sql stable security definer set search_path = fuelflow as $$
  select exists (select 1 from fuelflow.profiles where id = auth.uid() and activo);
$$;

-- Ecrã de login: saber se já existe algum utilizador (para mostrar "criar admin")
create or replace function fuelflow.has_users()
returns boolean language sql stable security definer set search_path = fuelflow as $$
  select exists (select 1 from fuelflow.profiles where role = 'admin' and activo);
$$;

-- Login com nome de utilizador: devolve o email associado (só utilizadores activos)
create or replace function fuelflow.login_email(p_username text)
returns text language sql stable security definer set search_path = fuelflow as $$
  select email from fuelflow.profiles where username = lower(trim(p_username)) and activo limit 1;
$$;

-- Admin define a senha de qualquer utilizador (ex.: operador esqueceu-se)
create or replace function fuelflow.admin_set_password(p_user_id uuid, p_password text)
returns void language plpgsql security definer set search_path = fuelflow, extensions as $$
begin
  if not fuelflow.is_admin() then raise exception 'Apenas o admin pode alterar senhas'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'A senha deve ter pelo menos 6 caracteres'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;
end $$;

-- ----------------------------------------------------------------------------
-- 2. PRODUTOS, TANQUES, MANGUEIRAS
-- ----------------------------------------------------------------------------
create table fuelflow.products (
  id          bigint generated always as identity primary key,
  nome        text not null,
  tipo        text not null default 'combustivel' check (tipo in ('combustivel','lubrificante','outro')),
  unidade     text not null default 'L',
  preco       numeric(12,2) not null default 0 check (preco >= 0),
  cor         text not null default '#f59e0b',
  activo      boolean not null default true,
  ordem       int not null default 0,
  created_at  timestamptz not null default now()
);

create table fuelflow.price_history (
  id              bigint generated always as identity primary key,
  product_id      bigint not null references fuelflow.products(id) on delete cascade,
  preco_anterior  numeric(12,2),
  preco_novo      numeric(12,2) not null,
  alterado_por    uuid references fuelflow.profiles(id) on delete set null default auth.uid(),
  alterado_em     timestamptz not null default now()
);

create or replace function fuelflow.log_price_change()
returns trigger language plpgsql security definer set search_path = fuelflow as $$
begin
  if tg_op = 'INSERT' or new.preco is distinct from old.preco then
    insert into fuelflow.price_history (product_id, preco_anterior, preco_novo, alterado_por)
    values (new.id, case when tg_op = 'UPDATE' then old.preco end, new.preco, auth.uid());
  end if;
  return new;
end $$;

create trigger products_price_log
  after insert or update of preco on fuelflow.products
  for each row execute function fuelflow.log_price_change();

create table fuelflow.tanks (
  id            bigint generated always as identity primary key,
  nome          text not null,
  product_id    bigint not null references fuelflow.products(id),
  capacidade    numeric(12,2) not null default 0 check (capacidade >= 0),
  nivel_actual  numeric(12,2) not null default 0,
  nivel_minimo  numeric(12,2) not null default 0,
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table fuelflow.hoses (
  id               bigint generated always as identity primary key,
  codigo           text not null,               -- ex.: "B1-M1"
  bomba            text not null default '',    -- ex.: "Bomba 1"
  product_id       bigint not null references fuelflow.products(id),
  tank_id          bigint references fuelflow.tanks(id) on delete set null,
  leitura_actual   numeric(14,2) not null default 0,  -- último contador fechado (herdado pelo próximo turno)
  activo           boolean not null default true,
  ordem            int not null default 0,
  created_at       timestamptz not null default now()
);

-- Recepções de combustível (entradas no tanque)
create table fuelflow.tank_deliveries (
  id           bigint generated always as identity primary key,
  tank_id      bigint not null references fuelflow.tanks(id) on delete cascade,
  data         date not null default current_date,
  quantidade   numeric(12,2) not null check (quantidade > 0),
  fornecedor   text not null default 'Petromoc',
  guia         text,
  preco_custo  numeric(12,2),
  notas        text,
  created_by   uuid references fuelflow.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create or replace function fuelflow.apply_delivery()
returns trigger language plpgsql security definer set search_path = fuelflow as $$
begin
  if tg_op = 'INSERT' then
    update fuelflow.tanks set nivel_actual = nivel_actual + new.quantidade where id = new.tank_id;
    return new;
  else
    update fuelflow.tanks set nivel_actual = nivel_actual - old.quantidade where id = old.tank_id;
    return old;
  end if;
end $$;

create trigger tank_deliveries_apply
  after insert or delete on fuelflow.tank_deliveries
  for each row execute function fuelflow.apply_delivery();

-- Medições físicas (vareta). Se "ajustar" = true, o nível do sistema passa a ser o medido.
create table fuelflow.tank_dips (
  id             bigint generated always as identity primary key,
  tank_id        bigint not null references fuelflow.tanks(id) on delete cascade,
  medido_em      timestamptz not null default now(),
  nivel_medido   numeric(12,2) not null,
  nivel_sistema  numeric(12,2) not null default 0,
  diferenca      numeric(12,2) generated always as (nivel_medido - nivel_sistema) stored,
  ajustar        boolean not null default false,
  notas          text,
  created_by     uuid references fuelflow.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);

create or replace function fuelflow.apply_dip()
returns trigger language plpgsql security definer set search_path = fuelflow as $$
begin
  select nivel_actual into new.nivel_sistema from fuelflow.tanks where id = new.tank_id;
  if new.ajustar then
    update fuelflow.tanks set nivel_actual = new.nivel_medido where id = new.tank_id;
  end if;
  return new;
end $$;

create trigger tank_dips_apply
  before insert on fuelflow.tank_dips
  for each row execute function fuelflow.apply_dip();

-- ----------------------------------------------------------------------------
-- 3. CLIENTES A CRÉDITO
-- ----------------------------------------------------------------------------
create table fuelflow.clients (
  id              bigint generated always as identity primary key,
  nome            text not null,
  nuit            text,
  contacto        text,
  email           text,
  endereco        text,
  limite_credito  numeric(14,2) not null default 0,   -- 0 = sem limite
  activo          boolean not null default true,
  notas           text,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. TURNOS
-- ----------------------------------------------------------------------------
create table fuelflow.shifts (
  id               bigint generated always as identity primary key,
  operador_id      uuid not null references fuelflow.profiles(id),
  aberto_em        timestamptz not null default now(),
  fechado_em       timestamptz,
  estado           text not null default 'aberto' check (estado in ('aberto','fechado','validado')),
  total_bomba      numeric(14,2) not null default 0,  -- litros vendidos × preço
  total_outras     numeric(14,2) not null default 0,  -- lubrificantes / loja
  total_credito    numeric(14,2) not null default 0,  -- lançamentos a crédito do turno
  total_esperado   numeric(14,2) not null default 0,  -- bomba + outras − crédito
  total_declarado  numeric(14,2) not null default 0,  -- numerário + m-pesa + POS + despesas…
  diferenca        numeric(14,2) not null default 0,  -- declarado − esperado
  notas            text,
  validado_por     uuid references fuelflow.profiles(id),
  validado_em      timestamptz,
  created_at       timestamptz not null default now()
);

create unique index shifts_one_open_per_operator on fuelflow.shifts (operador_id) where estado = 'aberto';

create table fuelflow.shift_readings (
  id               bigint generated always as identity primary key,
  shift_id         bigint not null references fuelflow.shifts(id) on delete cascade,
  hose_id          bigint not null references fuelflow.hoses(id),
  product_id       bigint not null references fuelflow.products(id),
  preco            numeric(12,2) not null,
  leitura_inicial  numeric(14,2) not null,
  leitura_final    numeric(14,2),
  litros           numeric(14,2) generated always as (coalesce(leitura_final, leitura_inicial) - leitura_inicial) stored,
  valor            numeric(14,2) generated always as ((coalesce(leitura_final, leitura_inicial) - leitura_inicial) * preco) stored,
  unique (shift_id, hose_id)
);

create or replace function fuelflow.own_open_shift(p_shift_id bigint)
returns boolean language sql stable security definer set search_path = fuelflow as $$
  select exists (
    select 1 from fuelflow.shifts s
    join fuelflow.profiles p on p.id = s.operador_id and p.activo
    where s.id = p_shift_id and s.operador_id = auth.uid() and s.estado = 'aberto'
  );
$$;

create or replace function fuelflow.can_see_shift(p_shift_id bigint)
returns boolean language sql stable security definer set search_path = fuelflow as $$
  select fuelflow.is_admin()
      or exists (select 1 from fuelflow.shifts s where s.id = p_shift_id and s.operador_id = auth.uid());
$$;

-- Lançamentos a crédito (abastecimentos de clientes a crédito)
create table fuelflow.credit_sales (
  id           bigint generated always as identity primary key,
  client_id    bigint not null references fuelflow.clients(id),
  shift_id     bigint references fuelflow.shifts(id) on delete set null,
  data         date not null default current_date,
  requisicao   text,
  matricula    text,
  motorista    text,
  product_id   bigint not null references fuelflow.products(id),
  quantidade   numeric(12,2) not null check (quantidade > 0),
  preco_unit   numeric(12,2),
  total        numeric(14,2) generated always as (round(quantidade * preco_unit, 2)) stored,
  invoice_id   bigint,
  notas        text,
  created_by   uuid references fuelflow.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index credit_sales_client_idx on fuelflow.credit_sales (client_id, data);
create index credit_sales_shift_idx on fuelflow.credit_sales (shift_id);

-- Outras vendas do turno (lubrificantes, loja)
create table fuelflow.other_sales (
  id           bigint generated always as identity primary key,
  shift_id     bigint not null references fuelflow.shifts(id) on delete cascade,
  product_id   bigint not null references fuelflow.products(id),
  quantidade   numeric(12,2) not null check (quantidade > 0),
  preco_unit   numeric(12,2),
  total        numeric(14,2) generated always as (round(quantidade * preco_unit, 2)) stored,
  created_by   uuid references fuelflow.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

-- Os operadores não escolhem o preço: é sempre o preço actual do produto.
create or replace function fuelflow.enforce_price()
returns trigger language plpgsql security definer set search_path = fuelflow as $$
begin
  if new.preco_unit is null or not fuelflow.is_admin() then
    select preco into new.preco_unit from fuelflow.products where id = new.product_id;
  end if;
  return new;
end $$;

create trigger credit_sales_price before insert or update on fuelflow.credit_sales
  for each row execute function fuelflow.enforce_price();
create trigger other_sales_price before insert or update on fuelflow.other_sales
  for each row execute function fuelflow.enforce_price();

-- Valores entregues no fecho (numerário, M-Pesa, e-Mola, POS…) e despesas pagas da caixa
create table fuelflow.cash_entries (
  id          bigint generated always as identity primary key,
  shift_id    bigint not null references fuelflow.shifts(id) on delete cascade,
  metodo      text not null check (metodo in ('numerario','mpesa','emola','pos','cheque','outro')),
  tipo        text not null default 'entrada' check (tipo in ('entrada','despesa')),
  valor       numeric(14,2) not null check (valor >= 0),
  referencia  text,
  notas       text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. PAGAMENTOS E FATURAS DE CLIENTES
-- ----------------------------------------------------------------------------
create table fuelflow.payments (
  id          bigint generated always as identity primary key,
  client_id   bigint not null references fuelflow.clients(id),
  data        date not null default current_date,
  valor       numeric(14,2) not null check (valor > 0),
  metodo      text not null default 'transferencia'
              check (metodo in ('transferencia','numerario','cheque','mpesa','emola','pos','outro')),
  referencia  text,
  notas       text,
  created_by  uuid references fuelflow.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index payments_client_idx on fuelflow.payments (client_id, data);

create table fuelflow.invoices (
  id              bigint generated always as identity primary key,
  numero          text not null unique,
  client_id       bigint not null references fuelflow.clients(id),
  periodo_inicio  date not null,
  periodo_fim     date not null,
  emitida_em      date not null default current_date,
  total           numeric(14,2) not null default 0,
  estado          text not null default 'emitida' check (estado in ('emitida','anulada')),
  notas           text,
  created_at      timestamptz not null default now()
);

alter table fuelflow.credit_sales
  add constraint credit_sales_invoice_fk foreign key (invoice_id) references fuelflow.invoices(id) on delete set null;

-- Saldos dos clientes (dívida = crédito − pagamentos)
create view fuelflow.client_balances with (security_invoker = true) as
select c.id, c.nome, c.nuit, c.contacto, c.limite_credito, c.activo,
       coalesce(cs.total, 0)                            as total_credito,
       coalesce(pg.total, 0)                            as total_pago,
       coalesce(cs.total, 0) - coalesce(pg.total, 0)    as saldo,
       cs.ultimo                                        as ultimo_lancamento,
       pg.ultimo                                        as ultimo_pagamento
from fuelflow.clients c
left join (select client_id, sum(total) total, max(data) ultimo from fuelflow.credit_sales group by client_id) cs on cs.client_id = c.id
left join (select client_id, sum(valor) total, max(data) ultimo from fuelflow.payments group by client_id) pg on pg.client_id = c.id;

-- Para o operador ver se o cliente passou o limite (sem ver os lançamentos dos outros)
create or replace function fuelflow.client_credit_status(p_client_id bigint)
returns table (saldo numeric, limite_credito numeric) language sql stable security definer set search_path = fuelflow as $$
  select coalesce((select sum(total) from fuelflow.credit_sales where client_id = c.id), 0)
       - coalesce((select sum(valor) from fuelflow.payments where client_id = c.id), 0),
         c.limite_credito
  from fuelflow.clients c
  where c.id = p_client_id and fuelflow.is_active();
$$;

-- ----------------------------------------------------------------------------
-- 6. FUNÇÕES DE NEGÓCIO
-- ----------------------------------------------------------------------------

-- Abrir turno: as leituras iniciais são HERDADAS do último fecho (o operador não as escreve).
create or replace function fuelflow.open_shift(p_hose_ids bigint[])
returns bigint language plpgsql security definer set search_path = fuelflow as $$
declare
  v_shift bigint;
  v_busy  text;
begin
  if not fuelflow.is_active() then raise exception 'Utilizador inactivo'; end if;
  if coalesce(array_length(p_hose_ids,1),0) = 0 then raise exception 'Escolhe pelo menos uma mangueira'; end if;
  if exists (select 1 from fuelflow.shifts where operador_id = auth.uid() and estado = 'aberto') then
    raise exception 'Já tens um turno aberto';
  end if;

  perform 1 from fuelflow.hoses where id = any(p_hose_ids) for update;

  select string_agg(h.codigo, ', ') into v_busy
  from fuelflow.shift_readings r
  join fuelflow.shifts s on s.id = r.shift_id and s.estado = 'aberto'
  join fuelflow.hoses h on h.id = r.hose_id
  where r.hose_id = any(p_hose_ids);
  if v_busy is not null then raise exception 'Mangueira(s) já em turno aberto: %', v_busy; end if;

  insert into fuelflow.shifts (operador_id) values (auth.uid()) returning id into v_shift;

  insert into fuelflow.shift_readings (shift_id, hose_id, product_id, preco, leitura_inicial)
  select v_shift, h.id, h.product_id, p.preco, h.leitura_actual
  from fuelflow.hoses h join fuelflow.products p on p.id = h.product_id
  where h.id = any(p_hose_ids) and h.activo
  order by h.ordem, h.codigo;

  return v_shift;
end $$;

-- Calcula os totais de um turno (sem o fechar)
create or replace function fuelflow.shift_totals(p_shift_id bigint)
returns table (total_bomba numeric, total_outras numeric, total_credito numeric,
               total_esperado numeric, total_declarado numeric, diferenca numeric)
language sql stable security definer set search_path = fuelflow as $$
  with t as (
    select
      coalesce((select sum(valor) from fuelflow.shift_readings where shift_id = p_shift_id), 0) b,
      coalesce((select sum(total) from fuelflow.other_sales   where shift_id = p_shift_id), 0) o,
      -- só o crédito de combustível sai das bombas; lubrificantes a crédito não entram no cálculo da caixa
      coalesce((select sum(cs.total) from fuelflow.credit_sales cs join fuelflow.products p on p.id = cs.product_id
                where cs.shift_id = p_shift_id and p.tipo = 'combustivel'), 0) c,
      coalesce((select sum(valor) from fuelflow.cash_entries  where shift_id = p_shift_id), 0) d
  )
  select b, o, c, b + o - c, d, d - (b + o - c) from t
  where fuelflow.can_see_shift(p_shift_id);
$$;

-- Fechar turno: valida leituras, actualiza contadores das mangueiras e stock dos tanques.
create or replace function fuelflow.close_shift(p_shift_id bigint)
returns void language plpgsql security definer set search_path = fuelflow as $$
declare
  v_s    fuelflow.shifts;
  v_bad  text;
  v_t    record;
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
  where r.shift_id = p_shift_id and r.leitura_final < r.leitura_inicial;
  if v_bad is not null then raise exception 'Leitura final menor que a inicial: %', v_bad; end if;

  update fuelflow.hoses h set leitura_actual = r.leitura_final
  from fuelflow.shift_readings r
  where r.shift_id = p_shift_id and r.hose_id = h.id;

  update fuelflow.tanks t set nivel_actual = t.nivel_actual - x.litros
  from (select h.tank_id, sum(r.litros) litros
        from fuelflow.shift_readings r join fuelflow.hoses h on h.id = r.hose_id
        where r.shift_id = p_shift_id and h.tank_id is not null
        group by h.tank_id) x
  where t.id = x.tank_id;

  select * into v_t from fuelflow.shift_totals(p_shift_id);

  update fuelflow.shifts set
    estado = 'fechado', fechado_em = now(),
    total_bomba = v_t.total_bomba, total_outras = v_t.total_outras, total_credito = v_t.total_credito,
    total_esperado = v_t.total_esperado, total_declarado = v_t.total_declarado, diferenca = v_t.diferenca
  where id = p_shift_id;
end $$;

-- Reabrir turno (admin): só se for o último turno dessas mangueiras. Reverte contadores e stock.
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

create or replace function fuelflow.validate_shift(p_shift_id bigint)
returns void language plpgsql security definer set search_path = fuelflow as $$
begin
  if not fuelflow.is_admin() then raise exception 'Apenas o admin pode validar turnos'; end if;
  update fuelflow.shifts set estado = 'validado', validado_por = auth.uid(), validado_em = now()
  where id = p_shift_id and estado = 'fechado';
  if not found then raise exception 'Só turnos fechados podem ser validados'; end if;
end $$;

-- Emitir fatura mensal: junta os lançamentos ainda não faturados do período.
create or replace function fuelflow.create_invoice(p_client_id bigint, p_inicio date, p_fim date, p_notas text default null)
returns bigint language plpgsql security definer set search_path = fuelflow as $$
declare
  v_id     bigint;
  v_num    text;
  v_seq    int;
  v_total  numeric;
  v_ano    text := to_char(current_date, 'YYYY');
begin
  if not fuelflow.is_admin() then raise exception 'Apenas o admin pode emitir faturas'; end if;
  perform pg_advisory_xact_lock(445566);

  select coalesce(sum(total),0) into v_total from fuelflow.credit_sales
  where client_id = p_client_id and data between p_inicio and p_fim and invoice_id is null;
  if v_total = 0 then raise exception 'Não há lançamentos por faturar neste período'; end if;

  select coalesce(max(split_part(numero, '/', 2)::int), 0) + 1 into v_seq
  from fuelflow.invoices where numero like 'FT ' || v_ano || '/%';
  v_num := 'FT ' || v_ano || '/' || lpad(v_seq::text, 4, '0');

  insert into fuelflow.invoices (numero, client_id, periodo_inicio, periodo_fim, total, notas)
  values (v_num, p_client_id, p_inicio, p_fim, v_total, p_notas) returning id into v_id;

  update fuelflow.credit_sales set invoice_id = v_id
  where client_id = p_client_id and data between p_inicio and p_fim and invoice_id is null;

  return v_id;
end $$;

create or replace function fuelflow.cancel_invoice(p_invoice_id bigint)
returns void language plpgsql security definer set search_path = fuelflow as $$
begin
  if not fuelflow.is_admin() then raise exception 'Apenas o admin pode anular faturas'; end if;
  update fuelflow.credit_sales set invoice_id = null where invoice_id = p_invoice_id;
  update fuelflow.invoices set estado = 'anulada' where id = p_invoice_id;
end $$;

-- ----------------------------------------------------------------------------
-- 7. SEGURANÇA (Row Level Security)
-- ----------------------------------------------------------------------------
alter table fuelflow.app_settings    enable row level security;
alter table fuelflow.profiles        enable row level security;
alter table fuelflow.products        enable row level security;
alter table fuelflow.price_history   enable row level security;
alter table fuelflow.tanks           enable row level security;
alter table fuelflow.hoses           enable row level security;
alter table fuelflow.tank_deliveries enable row level security;
alter table fuelflow.tank_dips       enable row level security;
alter table fuelflow.clients         enable row level security;
alter table fuelflow.shifts          enable row level security;
alter table fuelflow.shift_readings  enable row level security;
alter table fuelflow.credit_sales    enable row level security;
alter table fuelflow.other_sales     enable row level security;
alter table fuelflow.cash_entries    enable row level security;
alter table fuelflow.payments        enable row level security;
alter table fuelflow.invoices        enable row level security;

create policy settings_read  on fuelflow.app_settings for select using (fuelflow.is_active());
create policy settings_admin on fuelflow.app_settings for update using (fuelflow.is_admin()) with check (fuelflow.is_admin());

-- Perfis
create policy profiles_select on fuelflow.profiles for select using (id = auth.uid() or fuelflow.is_admin());
create policy profiles_admin  on fuelflow.profiles for update using (fuelflow.is_admin()) with check (fuelflow.is_admin());
create policy profiles_delete on fuelflow.profiles for delete using (fuelflow.is_admin() and id <> auth.uid());

-- Catálogo: todos os activos lêem, só o admin altera
create policy products_read  on fuelflow.products for select using (fuelflow.is_active());
create policy products_admin on fuelflow.products for all using (fuelflow.is_admin()) with check (fuelflow.is_admin());
create policy tanks_read     on fuelflow.tanks for select using (fuelflow.is_active());
create policy tanks_admin    on fuelflow.tanks for all using (fuelflow.is_admin()) with check (fuelflow.is_admin());
create policy hoses_read     on fuelflow.hoses for select using (fuelflow.is_active());
create policy hoses_admin    on fuelflow.hoses for all using (fuelflow.is_admin()) with check (fuelflow.is_admin());
create policy clients_read   on fuelflow.clients for select using (fuelflow.is_active());
create policy clients_admin  on fuelflow.clients for all using (fuelflow.is_admin()) with check (fuelflow.is_admin());

-- Só admin
create policy price_history_admin   on fuelflow.price_history   for all using (fuelflow.is_admin()) with check (fuelflow.is_admin());
create policy tank_deliveries_admin on fuelflow.tank_deliveries for all using (fuelflow.is_admin()) with check (fuelflow.is_admin());
create policy tank_dips_admin       on fuelflow.tank_dips       for all using (fuelflow.is_admin()) with check (fuelflow.is_admin());
create policy payments_admin        on fuelflow.payments        for all using (fuelflow.is_admin()) with check (fuelflow.is_admin());
create policy invoices_admin        on fuelflow.invoices        for all using (fuelflow.is_admin()) with check (fuelflow.is_admin());

-- Turnos: o operador vê os seus; abrir/fechar faz-se pelas funções acima
create policy shifts_select on fuelflow.shifts for select using (operador_id = auth.uid() or fuelflow.is_admin());
create policy shifts_admin  on fuelflow.shifts for update using (fuelflow.is_admin()) with check (fuelflow.is_admin());

create policy readings_select on fuelflow.shift_readings for select using (fuelflow.can_see_shift(shift_id));
create policy readings_update on fuelflow.shift_readings for update
  using (fuelflow.own_open_shift(shift_id) or fuelflow.is_admin())
  with check (fuelflow.own_open_shift(shift_id) or fuelflow.is_admin());

-- Lançamentos do turno: o operador mexe nos do seu turno aberto; o admin em tudo
create policy credit_select on fuelflow.credit_sales for select using (fuelflow.is_admin() or fuelflow.can_see_shift(shift_id));
create policy credit_insert on fuelflow.credit_sales for insert with check (fuelflow.is_admin() or fuelflow.own_open_shift(shift_id));
create policy credit_update on fuelflow.credit_sales for update
  using (fuelflow.is_admin() or (fuelflow.own_open_shift(shift_id) and invoice_id is null))
  with check (fuelflow.is_admin() or (fuelflow.own_open_shift(shift_id) and invoice_id is null));
create policy credit_delete on fuelflow.credit_sales for delete
  using (fuelflow.is_admin() or (fuelflow.own_open_shift(shift_id) and invoice_id is null));

create policy other_select on fuelflow.other_sales for select using (fuelflow.can_see_shift(shift_id));
create policy other_write  on fuelflow.other_sales for all
  using (fuelflow.is_admin() or fuelflow.own_open_shift(shift_id))
  with check (fuelflow.is_admin() or fuelflow.own_open_shift(shift_id));

create policy cash_select on fuelflow.cash_entries for select using (fuelflow.can_see_shift(shift_id));
create policy cash_write  on fuelflow.cash_entries for all
  using (fuelflow.is_admin() or fuelflow.own_open_shift(shift_id))
  with check (fuelflow.is_admin() or fuelflow.own_open_shift(shift_id));

-- O operador só pode escrever a leitura FINAL (a inicial é herdada e fica bloqueada)
revoke update on fuelflow.shift_readings from authenticated, anon;
grant  update (leitura_final) on fuelflow.shift_readings to authenticated;

-- Funções: só utilizadores autenticados (excepto as do ecrã de login)
revoke execute on all functions in schema fuelflow from public, anon;
grant  execute on all functions in schema fuelflow to authenticated;
grant  execute on function fuelflow.has_users()        to anon;
grant  execute on function fuelflow.login_email(text)  to anon;
grant  execute on function fuelflow.is_active(), fuelflow.is_admin(), fuelflow.can_see_shift(bigint), fuelflow.own_open_shift(bigint) to anon;

-- ----------------------------------------------------------------------------
-- 8. DADOS INICIAIS (podes alterar depois no app)
-- ----------------------------------------------------------------------------
insert into fuelflow.products (nome, tipo, unidade, preco, cor, ordem) values
  ('Gasolina', 'combustivel', 'L', 0, '#f59e0b', 1),
  ('Gasóleo',  'combustivel', 'L', 0, '#3b82f6', 2);
