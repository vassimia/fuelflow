-- ============================================================================
-- FuelFlow v2 — 003: Bombas da Estação de Serviço Quelimane
--   Lado A: Bombas 1 a 4    Lado B: Bombas 5 e 6
--   Cada bomba: 1 mangueira de Gasóleo (D) e 1 de Gasolina (S)
-- Mantém as mangueiras que já existem (só acerta nome, lado e ordem) e cria as que faltam.
-- As novas ficam com contador 0: acerta os contadores no app antes do primeiro turno.
-- ============================================================================
do $$
declare
  v_gas  bigint := (select id from fuelflow.products where nome ilike 'gasolina%' order by id limit 1);
  v_die  bigint := (select id from fuelflow.products where nome ilike 'gas_leo%' or nome ilike 'diesel%' order by id limit 1);
  v_a    bigint := (select id from fuelflow.sides where nome = 'Lado A');
  v_b    bigint := (select id from fuelflow.sides where nome = 'Lado B');
  v_n    int;
  v_side bigint;
  v_prod bigint;
  v_sfx  text;
  v_id   bigint;
begin
  if v_gas is null or v_die is null then raise exception 'Faltam os produtos Gasolina e Gasóleo'; end if;
  for v_n in 1..6 loop
    v_side := case when v_n <= 4 then v_a else v_b end;
    foreach v_sfx in array array['D', 'S'] loop
      v_prod := case when v_sfx = 'D' then v_die else v_gas end;
      -- mangueira já existente desta bomba e produto (ex.: "B1 - D", "B2 -D")
      select id into v_id from fuelflow.hoses
      where regexp_replace(codigo, '\s', '', 'g') ilike 'B' || v_n || '-' || v_sfx
         or (product_id = v_prod and regexp_replace(bomba, '\s', '', 'g') ilike 'bomba' || v_n)
      order by id limit 1;
      if v_id is null then
        insert into fuelflow.hoses (codigo, bomba, product_id, side_id, leitura_actual, ordem)
        values ('B' || v_n || ' - ' || v_sfx, 'BOMBA ' || v_n, v_prod, v_side, 0, v_n * 10 + (case when v_sfx = 'D' then 1 else 2 end));
      else
        update fuelflow.hoses set codigo = 'B' || v_n || ' - ' || v_sfx, bomba = 'BOMBA ' || v_n,
          product_id = v_prod, side_id = v_side, ordem = v_n * 10 + (case when v_sfx = 'D' then 1 else 2 end),
          tank_id = case when tank_id is not null and (select side_id from fuelflow.tanks where id = tank_id) = v_side then tank_id end
        where id = v_id;
      end if;
    end loop;
  end loop;

  -- Mangueiras sem tanque ligam ao único tanque do mesmo lado e produto (se houver só um)
  update fuelflow.hoses h set tank_id = t.id
  from fuelflow.tanks t
  where h.tank_id is null and t.side_id = h.side_id and t.product_id = h.product_id and t.activo
    and (select count(*) from fuelflow.tanks t2 where t2.side_id = h.side_id and t2.product_id = h.product_id and t2.activo) = 1;
end $$;

select s.nome as lado, h.bomba, h.codigo, p.nome as produto, h.leitura_actual as contador, t.nome as tanque
from fuelflow.hoses h join fuelflow.sides s on s.id = h.side_id join fuelflow.products p on p.id = h.product_id
left join fuelflow.tanks t on t.id = h.tank_id
order by h.ordem;
