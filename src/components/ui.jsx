import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

// ---------------------------------------------------------------- Ícones
const PATHS = {
  dashboard: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
  shift: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  clients: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75',
  credit: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  payment: 'M2 7h20v12H2zM2 11h20M6 15h4',
  invoice: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h7M9 17h7',
  tank: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3v12c0 1.7-3.1 3-7 3s-7-1.3-7-3zM5 6c0 1.7 3.1 3 7 3s7-1.3 7-3M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
  pump: 'M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M7 8h4M14 10h2l3 3v5a1.5 1.5 0 0 0 3 0V9l-3-3',
  report: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  users: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  menu: 'M3 6h18M3 12h18M3 18h18',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  check: 'M20 6 9 17l-5-5',
  back: 'M15 18l-6-6 6-6',
  drop: 'M12 2.7 5.6 9.1a9 9 0 1 0 12.8 0z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
}
export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] || ''} />
    </svg>
  )
}

// ---------------------------------------------------------------- Básicos
export function Btn({ variant = '', small, big, icon, children, className = '', ...p }) {
  const cls = ['btn', variant, small && 'small', big && 'big', className].filter(Boolean).join(' ')
  return <button type="button" className={cls} {...p}>{icon && <Icon name={icon} size={small ? 15 : 17} />}{children}</button>
}

export function Field({ label, hint, children }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
export const Input = ({ className = '', ...p }) => <input className={`input ${className}`} {...p} />
export const Select = ({ className = '', children, ...p }) => <select className={`select ${className}`} {...p}>{children}</select>
export const Textarea = (p) => <textarea className="textarea" {...p} />

export function Tag({ kind, children }) { return <span className={`tag ${kind || ''}`}>{children}</span> }
export const ESTADO_LABEL = { aberto: 'Aberto', fechado: 'Fechado', validado: 'Validado' }
export function EstadoTag({ estado }) { return <Tag kind={estado}>{ESTADO_LABEL[estado] || estado}</Tag> }

export function Empty({ title, children, action }) {
  return <div className="empty"><strong>{title}</strong>{children && <p>{children}</p>}{action && <div style={{ marginTop: 12 }}>{action}</div>}</div>
}
export function Loading() { return <div className="empty">A carregar…</div> }
export function ErrorNote({ error, onRetry }) {
  if (!error) return null
  return <div className="note err row between"><span>{error}</span>{onRetry && <Btn small variant="secondary" onClick={onRetry}>Tentar de novo</Btn>}</div>
}

// Contador mecânico: 001234,56
export function Meter({ value, size = '' }) {
  const s = Number(value || 0).toFixed(2)
  const [int, dec] = s.split('.')
  const digits = int.padStart(6, '0').split('')
  return (
    <span className={`meter ${size}`} aria-label={s}>
      {digits.map((d, i) => <b key={i}>{d}</b>)}
      {dec.split('').map((d, i) => <b key={'d' + i} className="dec">{d}</b>)}
    </span>
  )
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      <div className="spacer" />
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- Modal
export function Modal({ title, onClose, wide, children, footer }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

// Formulário em modal com botão de guardar
export function FormModal({ title, onClose, onSubmit, submitLabel = 'Guardar', wide, children, danger }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const toast = useToast()
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const msg = await onSubmit()
      if (msg) toast(msg)
      onClose()
    } catch (e2) { setErr(e2.message || String(e2)) } finally { setBusy(false) }
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className={`modal ${wide ? 'wide' : ''}`} onSubmit={submit} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button type="button" className="x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button></div>
        <div className="modal-body stack">{children}{err && <div className="note err">{err}</div>}</div>
        <div className="modal-foot">
          <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
          <button type="submit" className={`btn ${danger ? 'danger' : ''}`} disabled={busy}>{busy ? 'A guardar…' : submitLabel}</button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------- Toast + confirmar
const ToastCtx = createContext(() => {})
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((text, kind = '') => {
    const id = Math.random()
    setItems(x => [...x.slice(-1), { id, text, kind }])
    setTimeout(() => setItems(x => x.filter(i => i.id !== id)), kind === 'err' ? 6000 : 2200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">{items.map(i => <div key={i.id} className={`toast ${i.kind}`}>{i.text}</div>)}</div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

// Executa uma acção com toast de sucesso/erro
export function useAction() {
  const toast = useToast()
  return async (fn, okMsg) => {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true }
    catch (e) { toast(e.message || String(e), 'err'); return false }
  }
}

export function confirmar(msg) { return window.confirm(msg) }

// ---------------------------------------------------------------- Impressão
export function printDoc(element) {
  const host = document.createElement('div')
  host.className = 'print-only'
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(element)
  document.body.classList.add('printing')
  setTimeout(() => {
    window.print()
    document.body.classList.remove('printing')
    root.unmount()
    host.remove()
  }, 150)
}
