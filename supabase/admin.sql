-- ============================================================================
-- FuelFlow v2 — Usar uma conta que JÁ EXISTE no Supabase como administrador
--
-- Corre isto DEPOIS do schema.sql, no SQL Editor do Supabase.
-- Antes de correr, troca:
--   o email (se for outro)
--   MUDA_ESTA_SENHA  → a senha que queres usar (pelo menos 6 caracteres)
-- ============================================================================

-- 1. Definir a senha da conta
update auth.users
set encrypted_password = extensions.crypt('MUDA_ESTA_SENHA', extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where email = 'vassim.i.a@gmail.com';

-- 2. Dar acesso de administrador no FuelFlow v2
insert into fuelflow.profiles (id, nome, username, email, role, activo)
select id, 'Vassim', 'vassim', email, 'admin', true
from auth.users where email = 'vassim.i.a@gmail.com'
on conflict (id) do update set role = 'admin', activo = true;

-- Deve mostrar 1 linha com role = admin
select nome, username, email, role, activo from fuelflow.profiles where role = 'admin';
