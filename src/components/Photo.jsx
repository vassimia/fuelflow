import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Btn, Icon, Modal } from './ui.jsx'

const BUCKET = 'requisicoes'

// Reduz a foto (lado maior 1600 px, JPEG) para poupar dados móveis
export async function compressImage(file, max = 1600, quality = 0.72) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d').drawImage(img, 0, 0, w, h)
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', quality))
    return blob || file
  } catch { return file } finally { URL.revokeObjectURL(url) }
}

export async function uploadRequisicao(file) {
  const blob = await compressImage(file)
  const d = new Date()
  const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2))
  const path = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${id}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error('Não foi possível enviar a foto: ' + error.message)
  return path
}

export async function signedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) throw new Error('Não foi possível abrir a foto: ' + error.message)
  return data.signedUrl
}

// Campo para tirar/escolher a foto (mostra miniatura antes de guardar)
export function PhotoInput({ file, onChange, label = 'Foto da requisição' }) {
  const ref = useRef(null)
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const u = URL.createObjectURL(file); setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return (
    <div className="field">
      <span>{label}</span>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { onChange(e.target.files?.[0] || null); e.target.value = '' }} aria-label={label} />
      {preview ? (
        <div className="photo-box">
          <img src={preview} alt="Foto da requisição" />
          <div className="row">
            <Btn small variant="secondary" icon="camera" onClick={() => ref.current?.click()}>Tirar outra</Btn>
            <Btn small variant="ghost" onClick={() => onChange(null)}>Remover</Btn>
          </div>
        </div>
      ) : (
        <button type="button" className="photo-drop" onClick={() => ref.current?.click()}>
          <Icon name="camera" size={26} /><span>Tirar foto da requisição</span>
        </button>
      )}
    </div>
  )
}

// Botão que abre a foto guardada
export function PhotoButton({ path, small = true }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(null)
  const [open, setOpen] = useState(false)
  if (!path) return null
  const abrir = async () => {
    setOpen(true); setErr(null)
    if (!url) { try { setUrl(await signedUrl(path)) } catch (e) { setErr(e.message) } }
  }
  return (
    <>
      <button type="button" className={`photo-btn ${small ? '' : 'big'}`} onClick={abrir} aria-label="Ver foto da requisição" title="Ver foto da requisição">
        <Icon name="camera" size={small ? 15 : 18} />{!small && 'Ver foto'}
      </button>
      {open && (
        <Modal title="Foto da requisição" onClose={() => setOpen(false)} wide>
          {err ? <div className="note err">{err}</div> : !url ? <p className="muted">A abrir…</p> : (
            <div className="stack">
              <img src={url} alt="Foto da requisição" style={{ width: '100%', borderRadius: 8 }} />
              <a href={url} target="_blank" rel="noreferrer">Abrir em tamanho real</a>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

// Juntar foto a um lançamento já registado
export function AddPhotoButton({ saleId, onDone, label = 'Juntar foto' }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  async function pick(file) {
    if (!file) return
    setBusy(true); setErr(null)
    try {
      const path = await uploadRequisicao(file)
      const { error } = await supabase.from('credit_sales').update({ foto_path: path }).eq('id', saleId)
      if (error) throw new Error(error.message)
      onDone?.()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <span>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} aria-label={label} />
      <button type="button" className="photo-btn" disabled={busy} onClick={() => ref.current?.click()}>
        <Icon name="camera" size={15} />{busy ? 'A enviar…' : label}
      </button>
      {err && <div className="neg" style={{ fontSize: 12 }}>{err}</div>}
    </span>
  )
}
