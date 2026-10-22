-- ============================================================================
-- FuelFlow v2 — Migração 005: FOTO DA REQUISIÇÃO nos lançamentos a crédito
--   As fotos ficam no Storage do Supabase, num bucket privado "requisicoes".
--   Ver: o admin vê todas; o operador vê as que ele próprio carregou.
-- Pode ser corrida mais do que uma vez.
-- ============================================================================

alter table fuelflow.credit_sales add column if not exists foto_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('requisicoes', 'requisicoes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fuelflow requisicoes insert" on storage.objects;
drop policy if exists "fuelflow requisicoes select" on storage.objects;
drop policy if exists "fuelflow requisicoes delete" on storage.objects;

create policy "fuelflow requisicoes insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'requisicoes' and fuelflow.is_active());
create policy "fuelflow requisicoes select" on storage.objects for select to authenticated
  using (bucket_id = 'requisicoes' and (fuelflow.is_admin() or owner = auth.uid()));
create policy "fuelflow requisicoes delete" on storage.objects for delete to authenticated
  using (bucket_id = 'requisicoes' and (fuelflow.is_admin() or owner = auth.uid()));

-- O operador pode juntar a foto a um lançamento do seu turno aberto (mesmo depois de o registar),
-- e o admin a qualquer lançamento. A regra de update de credit_sales já cobre estes casos.
grant update (foto_path) on fuelflow.credit_sales to authenticated;

notify pgrst, 'reload schema';
