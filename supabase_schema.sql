-- ============================================================
-- FuelFlow — Schema Supabase
-- Cola este SQL em: Supabase → SQL Editor → New Query → Run
-- ============================================================

-- Clientes
create table if not exists clients (
  id         bigserial primary key,
  nome       text not null,
  nif        text,
  contacto   text,
  email      text,
  cidade     text default 'Maputo',
  tipo       text default 'pos-pago' check (tipo in ('pre-pago','pos-pago')),
  created_at timestamptz default now()
);

-- Produtos
create table if not exists products (
  id         bigserial primary key,
  nome       text not null,
  unidade    text default 'L',
  preco      numeric(12,2) default 0,
  cor        text default '#f59e0b',
  created_at timestamptz default now()
);

-- Histórico de preços
create table if not exists price_history (
  id              bigserial primary key,
  "produtoId"     bigint references products(id) on delete cascade,
  "produtoNome"   text,
  "precoAnterior" numeric(12,2),
  "precoNovo"     numeric(12,2),
  data            date,
  motivo          text,
  created_at      timestamptz default now()
);

-- Pedidos
create table if not exists orders (
  id           bigserial primary key,
  "clienteId"  bigint references clients(id) on delete cascade,
  data         date not null,
  "reqNum"     text,
  "produtoId"  bigint references products(id),
  qtd          numeric(12,3),
  "valorUnit"  numeric(12,2),
  total        numeric(12,2),
  created_at   timestamptz default now()
);

-- Pagamentos
create table if not exists payments (
  id           bigserial primary key,
  "clienteId"  bigint references clients(id) on delete cascade,
  data         date not null,
  valor        numeric(12,2),
  referencia   text,
  metodo       text default 'Transferência',
  notas        text,
  "faturaId"   bigint,
  created_at   timestamptz default now()
);

-- Faturas mensais
create table if not exists invoices (
  id            bigserial primary key,
  numero        text not null,
  "clienteId"   bigint references clients(id) on delete cascade,
  periodo       text not null,
  total         numeric(12,2),
  "emitida_em"  date,
  notas         text,
  created_at    timestamptz default now()
);

-- ── Row Level Security ─────────────────────────────────────────
alter table clients       enable row level security;
alter table products      enable row level security;
alter table price_history enable row level security;
alter table orders        enable row level security;
alter table payments      enable row level security;
alter table invoices      enable row level security;

-- Políticas: acesso completo (podes adicionar autenticação depois)
create policy "allow_all_clients"       on clients       for all using (true) with check (true);
create policy "allow_all_products"      on products      for all using (true) with check (true);
create policy "allow_all_price_history" on price_history for all using (true) with check (true);
create policy "allow_all_orders"        on orders        for all using (true) with check (true);
create policy "allow_all_payments"      on payments      for all using (true) with check (true);
create policy "allow_all_invoices"      on invoices      for all using (true) with check (true);

-- ── Produtos iniciais ──────────────────────────────────────────
insert into products (nome, unidade, preco, cor) values
  ('Gasolina',   'L',  91.42,  '#f59e0b'),
  ('Diesel',     'L',  92.42,  '#3b82f6'),
  ('Petróleo',   'L',  88.00,  '#8b5cf6'),
  ('Óleo Motor', 'L',  450.00, '#10b981'),
  ('Outros',     'un', 0,      '#6b7280');
