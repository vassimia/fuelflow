const nf2 = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
const nf0 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0, useGrouping: 'always' })

export const n2 = (v) => nf2.format(Number(v || 0))
export const n0 = (v) => nf0.format(Number(v || 0))
export const mt = (v) => `${nf2.format(Number(v || 0))} MT`
export const lt = (v) => `${nf2.format(Number(v || 0))} L`

export const today = () => toISODate(new Date())
export function toISODate(d) {
  const x = new Date(d)
  const z = new Date(x.getTime() - x.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
export function monthStart(d = new Date()) { return toISODate(new Date(d.getFullYear(), d.getMonth(), 1)) }
export function monthEnd(d = new Date()) { return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
export function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return toISODate(d) }

export function dt(v) {
  if (!v) return '—'
  const d = new Date(v.length === 10 ? v + 'T12:00:00' : v)
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
export function dtt(v) {
  if (!v) return '—'
  return new Date(v).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
export function hm(v) {
  if (!v) return '—'
  return new Date(v).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}
export function duration(a, b) {
  const ms = new Date(b || Date.now()) - new Date(a)
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000)
  return `${h}h${String(m).padStart(2, '0')}`
}

export const METODOS_CAIXA = {
  numerario: 'Numerário', mpesa: 'M-Pesa', emola: 'e-Mola', pos: 'POS / cartão', cheque: 'Cheque', outro: 'Outro',
}
export const METODOS_PAG = {
  transferencia: 'Transferência', numerario: 'Numerário', cheque: 'Cheque', mpesa: 'M-Pesa', emola: 'e-Mola', pos: 'POS / cartão', outro: 'Outro',
}
export const TIPOS_PRODUTO = { combustivel: 'Combustível', lubrificante: 'Lubrificante', outro: 'Outro' }

export function parseNum(v) {
  if (v === '' || v == null) return null
  const s = String(v).replace(/\s/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function downloadCSV(filename, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + rows.map(r => r.map(esc).join(';')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

// Início/fim de um dia local (Maputo) em ISO UTC, para filtrar timestamps
export const dayStart = (iso) => new Date(iso + 'T00:00:00').toISOString()
export const dayEnd = (iso) => new Date(iso + 'T23:59:59.999').toISOString()
