import { supabase, q } from './supabase.js'

export const getProducts = () => q(supabase.from('products').select('*').order('ordem').order('nome'))
export const getSides = () => q(supabase.from('sides').select('*').order('ordem').order('nome'))
export const getTanks = () => q(supabase.from('tanks').select('*').order('nome'))
export const getHoses = () => q(supabase.from('hoses').select('*').order('ordem').order('codigo'))
export const getClients = () => q(supabase.from('clients').select('*').order('nome'))
export const getProfiles = () => q(supabase.from('profiles').select('*').order('nome'))
export const getSettings = () => q(supabase.from('app_settings').select('*').eq('id', 1).maybeSingle())

export const byId = (list) => Object.fromEntries((list || []).map(x => [x.id, x]))

export async function shiftTotals(shiftId) {
  const r = await q(supabase.rpc('shift_totals', { p_shift_id: shiftId }))
  return (r && r[0]) || { total_bomba: 0, total_outras: 0, total_credito: 0, total_esperado: 0, total_declarado: 0, diferenca: 0 }
}

// Carrega tudo o que um turno precisa
export async function loadShift(id) {
  const [shift, readings, credit, other, cash] = await Promise.all([
    q(supabase.from('shifts').select('*').eq('id', id).single()),
    q(supabase.from('shift_readings').select('*').eq('shift_id', id).order('id')),
    q(supabase.from('credit_sales').select('*').eq('shift_id', id).order('created_at')),
    q(supabase.from('other_sales').select('*').eq('shift_id', id).order('created_at')),
    q(supabase.from('cash_entries').select('*').eq('shift_id', id).order('created_at')),
  ])
  const totals = shift.estado === 'aberto' ? await shiftTotals(id) : shift
  // Mangueiras pela ordem da bomba
  const hoses = byId(await getHoses())
  readings.sort((a, b) => (hoses[a.hose_id]?.ordem ?? 0) - (hoses[b.hose_id]?.ordem ?? 0) ||
    String(hoses[a.hose_id]?.codigo).localeCompare(String(hoses[b.hose_id]?.codigo)))
  return { shift, readings, credit, other, cash, totals }
}
