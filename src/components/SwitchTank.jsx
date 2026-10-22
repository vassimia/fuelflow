import { useEffect, useState } from 'react'
import { supabase, q } from '../lib/supabase.js'
import { n2, lt, parseNum } from '../lib/format.js'
import { Modal, Field, Input, Select, Btn, Meter, useToast } from './ui.jsx'

// Trocar o tanque que está a trabalhar num lado (ou ligar o primeiro).
// shiftId: turno aberto no lado (se houver) — nesse caso pedem-se os contadores das mangueiras.
export default function SwitchTankForm({ sideId, sideName, shiftId, tanks, hoses, products, productId, onClose, onSaved }) {
  const toast = useToast()
  const fuels = products.filter(p => p.tipo === 'combustivel' && tanks.some(t => t.side_id === sideId && t.product_id === p.id))
  const [pid, setPid] = useState(productId || fuels[0]?.id || '')
  const from = tanks.find(t => t.side_id === sideId && t.product_id === Number(pid) && t.estado === 'activo')
  const options = tanks.filter(t => t.side_id === sideId && t.product_id === Number(pid) && t.estado !== 'activo' && t.activo)
  const hs = hoses.filter(h => h.side_id === sideId && h.product_id === Number(pid) && h.activo)
  const [to, setTo] = useState('')
  const [sobra, setSobra] = useState('')
  const [notas, setNotas] = useState('')
  const [vals, setVals] = useState({})
  const [chk, setChk] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => { setTo(options.length === 1 ? String(options[0].id) : ''); setSobra(from ? String(from.lastro ?? 200) : '') }, [pid]) // eslint-disable-line
  useEffect(() => {
    setChk({}); setVals({})
    if (!shiftId) return
    let alive = true
    Promise.all(hs.map(h => q(supabase.rpc('hose_checkpoint', { p_shift_id: shiftId, p_hose_id: h.id })).then(v => [h.id, Number(v)])))
      .then(r => alive && setChk(Object.fromEntries(r))).catch(() => {})
    return () => { alive = false }
  }, [pid, shiftId]) // eslint-disable-line

  const litros = shiftId ? hs.reduce((a, h) => { const v = parseNum(vals[h.id]); return a + (v != null && chk[h.id] != null ? Math.max(0, v - chk[h.id]) : 0) }, 0) : 0

  async function save(e) {
    e?.preventDefault(); setErr(null)
    if (!to) return setErr('Escolhe o tanque que vai começar a trabalhar.')
    const s = parseNum(sobra)
    if (from && (s == null || s < 0)) return setErr(`Escreve quanto ficou no ${from.nome} (medido na vareta).`)
    const readings = []
    if (shiftId) {
      for (const h of hs) {
        const v = parseNum(vals[h.id])
        if (v == null) return setErr(`Escreve o contador da mangueira ${h.codigo}.`)
        if (chk[h.id] != null && v < chk[h.id]) return setErr(`O contador de ${h.codigo} não pode ser menor que ${n2(chk[h.id])}.`)
        readings.push({ hose_id: h.id, leitura: v })
      }
    }
    setBusy(true)
    try {
      await q(supabase.rpc('switch_tank', { p_side_id: sideId, p_product_id: Number(pid), p_tank_to: Number(to), p_sobra: from ? s : null, p_readings: readings, p_notas: notas.trim() || null }))
      const novo = options.find(t => String(t.id) === String(to))
      toast(from ? `Troca registada: agora trabalha o ${novo?.nome}` : `${novo?.nome} ligado`)
      onSaved()
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={from ? `Trocar tanque — ${sideName}` : `Ligar tanque — ${sideName}`} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {fuels.length === 0 ? <div className="note warn">Este lado ainda não tem tanques registados.</div> : <>
          <Field label="Produto">
            <Select value={pid} onChange={e => setPid(e.target.value)}>{fuels.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</Select>
          </Field>
          {from && <div className="note">A trabalhar agora: <b>{from.nome}</b></div>}
          {options.length === 0 ? <div className="note warn">Não há outro tanque de {products.find(p => p.id === Number(pid))?.nome} parado neste lado.</div> : (
            <Field label="Tanque que vai começar a trabalhar">
              <Select required value={to} onChange={e => setTo(e.target.value)}>
                <option value="">Escolher…</option>
                {options.map(t => <option key={t.id} value={t.id}>{t.nome} — {lt(t.nivel_actual)}</option>)}
              </Select>
            </Field>
          )}
          {from && (
            <Field label={`Sobra no ${from.nome} (vareta, L)`} hint={`O lastro deste tanque é ${lt(from.lastro ?? 200)}. Escreve o que a vareta mostra.`}>
              <Input className="big" required value={sobra} onChange={e => setSobra(e.target.value)} inputMode="decimal" />
            </Field>
          )}
          {shiftId && hs.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <b>Contadores agora, no momento da troca</b>
              {hs.map(h => (
                <div key={h.id} className="reading" style={{ gap: 6 }}>
                  <div className="row between"><span><b>{h.codigo}</b> <span className="muted">{h.bomba}</span></span>{chk[h.id] != null && <Meter value={chk[h.id]} size="sm" />}</div>
                  <Input className="big num" inputMode="decimal" placeholder={chk[h.id] != null ? n2(chk[h.id]) : ''} value={vals[h.id] ?? ''} onChange={e => setVals(v => ({ ...v, [h.id]: e.target.value }))} aria-label={`Contador ${h.codigo}`} />
                </div>
              ))}
              {from && <div className="kv"><span>Saíram do {from.nome} desde o último registo</span><b className="num">{lt(litros)}</b></div>}
            </div>
          )}
          {!shiftId && <p className="muted" style={{ fontSize: 13 }}>Não há turno aberto neste lado, por isso usam-se os contadores actuais das mangueiras.</p>}
          <Field label="Notas"><Input value={notas} onChange={e => setNotas(e.target.value)} /></Field>
          {err && <div className="note err">{err}</div>}
          <Btn big disabled={busy || !options.length} onClick={save}>{busy ? 'A registar…' : from ? 'Registar troca' : 'Ligar tanque'}</Btn>
        </>}
      </form>
    </Modal>
  )
}
