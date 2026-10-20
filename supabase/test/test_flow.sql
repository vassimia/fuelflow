\set ON_ERROR_STOP on
\set QUIET on
set search_path = fuelflow, public;
-- Utilizadores
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'admin@test.mz', '{"nome":"Vassim"}'),
 ('00000000-0000-0000-0000-00000000000b', 'admin+joao@test.mz', '{"nome":"João","username":"joao"}');
select 'perfis' t, nome, username, role, activo from fuelflow.profiles order by role;

-- ADMIN
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update fuelflow.profiles set activo = true where username = 'joao';
update fuelflow.products set preco = 90 where nome = 'Gasolina';
update fuelflow.products set preco = 85 where nome = 'Gasóleo';
insert into fuelflow.tanks (nome, product_id, capacidade) select 'Tanque Gasolina', id, 20000 from products where nome='Gasolina';
insert into fuelflow.tank_deliveries (tank_id, quantidade, guia) select id, 10000, 'G-1' from tanks;
insert into fuelflow.hoses (codigo, bomba, product_id, tank_id, leitura_actual)
  select 'B1-M1', 'Bomba 1', p.id, t.id, 1000 from products p, tanks t where p.nome='Gasolina';
insert into fuelflow.hoses (codigo, bomba, product_id, leitura_actual)
  select 'B1-M2', 'Bomba 1', id, 500 from products where nome='Gasóleo';
insert into fuelflow.clients (nome, limite_credito) values ('H.A.M.C. Lda', 50000);
select 'tanque após recepção' t, nivel_actual from tanks;
select 'set pwd' t, fuelflow.admin_set_password('00000000-0000-0000-0000-00000000000b', 'segredo1');
reset role;
select 'hash ok' t, (encrypted_password like '$2%') ok from auth.users where email like 'admin+joao%';
set role authenticated;

-- OPERADOR
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'op vê clientes' t, count(*) from clients;
select 'op vê pagamentos (0)' t, count(*) from payments;
select 'abrir' t, fuelflow.open_shift(array(select id from hoses)) as shift_id;
select 'leituras herdadas' t, h.codigo, r.leitura_inicial, r.preco from shift_readings r join hoses h on h.id=r.hose_id order by 2;

\set ON_ERROR_STOP off
\echo '--- esperado ERRO: operador mexe na leitura inicial'
update shift_readings set leitura_inicial = 0;
\echo '--- esperado ERRO: fechar sem leituras finais'
select fuelflow.close_shift((select id from shifts limit 1));
\echo '--- esperado ERRO: abrir segundo turno'
select fuelflow.open_shift(array(select id from hoses));
\echo '--- esperado ERRO/0 linhas: operador altera preço do produto'
update products set preco = 1;
\set ON_ERROR_STOP on

update shift_readings set leitura_final = leitura_inicial + 200 where hose_id = (select id from hoses where codigo='B1-M1');
update shift_readings set leitura_final = leitura_inicial + 100 where hose_id = (select id from hoses where codigo='B1-M2');
-- operador tenta pôr preço 1: deve ficar 90
insert into credit_sales (client_id, shift_id, product_id, quantidade, preco_unit, requisicao, matricula)
  select c.id, s.id, p.id, 50, 1, 'R-001', 'AAA-111-MC' from clients c, shifts s, products p where p.nome='Gasolina';
insert into cash_entries (shift_id, metodo, valor) select id, 'numerario', 20000 from shifts;
insert into cash_entries (shift_id, metodo, valor) select id, 'mpesa', 2000 from shifts;
insert into cash_entries (shift_id, metodo, tipo, valor, notas) select id, 'numerario', 'despesa', 500, 'água' from shifts;
select 'preço forçado' t, preco_unit, total from credit_sales;
select 'totais antes de fechar' t, * from fuelflow.shift_totals((select id from shifts limit 1));
select 'fechar' t, fuelflow.close_shift((select id from shifts limit 1));
select 'op estado' t, estado, total_bomba, total_credito, total_esperado, total_declarado, diferenca from shifts;

-- ADMIN
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'contadores' t, codigo, leitura_actual from hoses order by 2;
select 'tanque após turno (9800)' t, nivel_actual from tanks;
insert into payments (client_id, valor, referencia) select id, 1000, 'TRF-1' from clients;
select 'saldo (3500)' t, nome, total_credito, total_pago, saldo from client_balances;
select 'fatura' t, fuelflow.create_invoice((select id from clients), current_date - 30, current_date);
select 'fatura num' t, numero, total from invoices;
select 'reabrir' t, fuelflow.reopen_shift((select id from shifts limit 1));
select 'após reabrir' t, codigo, leitura_actual from hoses order by 2;
select 'tanque (10000)' t, nivel_actual from tanks;
select 'fechar de novo' t, fuelflow.close_shift((select id from shifts limit 1));
select 'validar' t, fuelflow.validate_shift((select id from shifts limit 1));
insert into tank_dips (tank_id, nivel_medido, ajustar) select id, 9750, true from tanks;
select 'medição' t, nivel_sistema, nivel_medido, diferenca from tank_dips;
select 'tanque ajustado (9750)' t, nivel_actual from tanks;
select 'histórico preços' t, count(*) from price_history;
reset role;
set role anon;
set request.jwt.claim.sub = '';
select 'anon has_users' t, fuelflow.has_users(), fuelflow.login_email('JOAO');
\set ON_ERROR_STOP off
\echo '--- esperado ERRO: anon lê clientes'
select count(*) from fuelflow.clients;
\echo 'FIM'
