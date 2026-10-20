import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY)

export const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

// Cliente separado (sem guardar sessão) para o admin registar operadores
// sem perder a sua própria sessão.
export const signupClient = configured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'ff-signup' } })
  : null

// Executa uma query e lança erro legível
export async function q(promise) {
  const { data, error } = await promise
  if (error) throw new Error(traduzErro(error.message))
  return data
}

export function traduzErro(msg = '') {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Utilizador ou senha incorrectos.'
  if (m.includes('email not confirmed')) return 'Conta ainda não confirmada. No Supabase, desliga "Confirm email" (ver guia).'
  if (m.includes('user already registered')) return 'Já existe uma conta com esse email/utilizador.'
  if (m.includes('duplicate key') && m.includes('username')) return 'Esse nome de utilizador já existe.'
  if (m.includes('row-level security') || m.includes('permission denied')) return 'Sem permissão para esta operação.'
  if (m.includes('password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.'
  if (m.includes('failed to fetch')) return 'Sem ligação à internet ou ao servidor.'
  return msg
}
