\set ON_ERROR_STOP on
\set QUIET on
set search_path = fuelflow, public;
-- Teste da migração 004: dois tanques de gasóleo no Lado A, troca a meio do turno
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'admin@test.mz', '{"nome":"Vassim"}'),
 ('00000000-0000-0000-0000-00000000000b', 'admin+joao@test.mz', '{"nome":"João","username":"joao"}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update profiles set activo = true;
update products set preco = 100 where nome = 'Gasóleo';
insert into tanks (nome, product_id, side_id, capacidade, nivel_actual)
  select 'T1 Gasóleo', p.id, s.id, 30000, 800 from products p, sides s where p.nome='Gasóleo' and s.nome='Lado A';
insert into tanks (nome, product_id, side_id, capacidade, nivel_actual)
  select 'T2 Gasóleo', p.id, s.id, 30000, 10000 from products p, sides s where p.nome='Gasóleo' and s.nome='Lado A';
insert into hoses (codigo, bomba, product_id, side_id, leitura_actual, ordem)
  select 'B1 - D', 'BOMBA 1', p.id, s.id, 1000, 11 from products p, sides s where p.nome='Gasóleo' and s.nome='Lado A';
insert into hoses (codigo, bomba, product_id, side_id, leitura_actual, ordem)
  select 'B2 - D', 'BOMBA 2', p.id, s.id, 2000, 21 from products p, sides s where p.nome='Gasóleo' and s.nome='Lado A';
select 'estados (T1 activo)' t, nome, estado, nivel_actual from tanks order by id;

select 'ciclo T1 inicio' t, contadores_inicio from tank_cycles;

-- Operador abre turno no Lado A
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'abrir' t, open_shift((select id from sides where nome='Lado A'));

\set ON_ERROR_STOP off
\echo '--- esperado ERRO: contador menor que o inicial'
select switch_tank(1, 2, 2, 200, '[{"hose_id":1,"leitura":900},{"hose_id":2,"leitura":2100}]');
\echo '--- esperado ERRO: falta contador'
select switch_tank(1, 2, 2, 200, '[{"hose_id":1,"leitura":1300}]');
\set ON_ERROR_STOP on

-- Troca: B1 1300 (+300), B2 2100 (+100) => 400 L do T1; sobra 200
select 'troca' t, switch_tank(1, 2, 2, 200, '[{"hose_id":1,"leitura":1300},{"hose_id":2,"leitura":2100}]', 'T1 chegou ao lastro');
select 'apos troca' t, nome, estado, nivel_actual from tanks order by id;


\set ON_ERROR_STOP off
\echo '--- esperado ERRO: leitura final menor que a da troca'
update shift_readings set leitura_final = 1250 where hose_id = 1;
select close_shift(1);
\set ON_ERROR_STOP on
update shift_readings set leitura_final = 1500 where hose_id = 1;   -- +200 do T2
update shift_readings set leitura_final = 2300 where hose_id = 2;   -- +200 do T2
select 'fechar' t, close_shift(1);
select 'apos fecho (T1 200, T2 9600)' t, nome, estado, nivel_actual from tanks order by id;
select 'litros do turno (600)' t, sum(litros) from shift_readings;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'uso' t, tank_id, origem, litros from tank_usage order by id;
select 'ciclo T1 fechado (vendido 400, perda 800-400-200=200)' t, vendido, entradas, sobra, perda from tank_cycles where tank_id = 1 and terminado_em is not null;
select 'ciclo T2 em curso (400 vendido ate agora)' t, tank_nome, nivel_inicial, vendido_ate_agora from tank_cycle_status where terminado_em is null;
select 'reabrir' t, reopen_shift(1);
select 'apos reabrir (T2 10000)' t, nome, nivel_actual from tanks order by id;
select 'fechar de novo' t, close_shift(1);
select 'final (T2 9600)' t, nome, nivel_actual from tanks order by id;
-- recepção no T1 parado e nova troca de volta (fora de turno: usa contadores actuais)
insert into tank_deliveries (tank_id, quantidade) values (1, 15000);
select 'T1 apos recepção (15200)' t, nivel_actual from tanks where id = 1;
-- acertar contador (rebase do ciclo aberto do T2)
select 'acertar' t, set_hose_counters('[{"id":1,"leitura":50}]');
select 'ciclo T2 inicio rebase (1300-1500+50 = -150)' t, contadores_inicio from tank_cycles where tank_id = 2 and terminado_em is null;
select 'troca fora turno' t, switch_tank(1, 2, 1, 9500, null);
select 'ciclo T2 fechado (vendido 400, perda 10000-400-9500=100)' t, vendido, sobra, perda from tank_cycles where tank_id = 2;
select 'estados finais' t, nome, estado, nivel_actual from tanks order by id;
\echo FIM
