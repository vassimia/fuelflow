import { useEffect, useMemo, useState } from 'react'
import { supabase, q } from '../lib/supabase.js'
import { useData } from '../lib/hooks.js'
import { loadShift, getHoses, getProducts, getClients, getSides, byId } from '../lib/refs.js'
import { mt, lt, n2, hm, dt, dtt, duration, today, parseNum, METODOS_CAIXA } from '../lib/format.js'
import { Btn, Field, Input, Select, Icon, Meter, Loading, ErrorNote, Empty, EstadoTag, Modal, useAction, useToast, confirmar } from '../components/ui.jsx'
import { ShiftTotals, CashList } from '../components/ShiftReport.jsx'

export default function OperatorApp({ profile, onLogout, onAdminMode }) {
  const { data, loading, error, reload } = useData(async () => {
    const [open, hoses, products, clients, history, sides] = await Promise.all([
      q(supabase.from('shifts').select('*').eq('operador_id', profile.id).eq('estado', 'aberto').maybeSingle()),
      getHoses(), getProducts(), getClients(),
      q(supabase.from('shifts').select('*').eq('operador_id', profile.id).neq('estado', 'aberto').order('aberto_em', { ascending: false }).limit(8)),
      getSides(),
    ])
    return { open, hoses, products, clients, history, sides: byId(sides) }
  }, [profile.id])
  const [done, setDone] = useState(null)

  return (
    <div className="op">
      <header className="op-head">
        <div className="brand-mark"><i /></div>
        <div style={{ lineHeight: 1.2 }}><b>{profile.nome}</b><div style={{ fontSize: 12, color: '#A9B6C3' }}>{data?.open ? `${data.sides[data.open.side_id]?.nome || ''} · Turno #${data.open.id} desde ${hm(data.open.aberto_em)}` : 'Sem turno aberto'}</div></div>
        <div className="spacer" />
        {onAdminMode && <button className="btn small secondary" onClick={onAdminMode}>Admin</button>}
        <button className="btn small ghost" style={{ color: '#fff' }} onClick={onLogout} aria-label="Sair"><Icon name="logout" /></button>
      </header>
      {loading && !data ? <Loading /> : error ? <div className="op-body"><ErrorNote error={error} onRetry={reload} /></div>
        : done ? <ClosedScreen shift={done} side={data.sides[done.side_id]?.nome} onOk={() => { setDone(null); reload() }} />
        : data.open ? <OpenShift shiftId={data.open.id} refs={data} onClosed={(s) => setDone(s)} />
        : <StartShift refs={data} history={data.history} onOpened={reload} />}
    </div>
  )
}

// ---------------------------------------------------------------- Abrir turno
function StartShift({ refs, history, onOpened }) {
  const act = useAction()
  const prod = byId(refs.products)
  const status = useData(() => q(supabase.rpc('side_status')), [])
  const [side, setSide] = useState(null)
  const [busy, setBusy] = useState(false)
  const sides = status.data || []
  const chosen = sides.find(s => s.side_id === side)
  const hoses = refs.hoses.filter(h => h.activo && h.side_id === side)
  const bombas = [...new Set(hoses.map(h => h.bomba || ''))]

  async function abrir() {
    setBusy(true)
    const ok = await act(() => q(supabase.rpc('open_shift', { p_side_id: side })), `Turno aberto no ${chosen?.nome}`)
    setBusy(false)
    if (ok) onOpened()
    else status.reload()
  }

  return (
    <>
      <div className="op-body">
        <div><h1>Abrir turno</h1><p className="muted" style={{ marginTop: 4 }}>Escolhe o lado onde vais trabalhar. O turno abre com todas as mangueiras desse lado.</p></div>
        <ErrorNote error={status.error} onRetry={status.reload} />
        {status.loading && !status.data ? <Loading /> : sides.length === 0 ? <Empty title="Ainda não há lados configurados">O administrador tem de configurar as bombas primeiro.</Empty> : (
          <div className="stack" style={{ gap: 10 }} role="radiogroup" aria-label="Lado">
            {sides.map(s => {
              const ocupado = !!s.turno_id
              return (
                <label key={s.side_id} className={`hose-pick ${side === s.side_id ? 'on' : ''} ${ocupado ? 'busy' : ''}`}>
                  <input type="radio" name="lado" disabled={ocupado} checked={side === s.side_id} onChange={() => setSide(s.side_id)} />
                  <div style={{ flex: 1 }}>
                    <div className="row between"><b style={{ fontSize: 18 }}>{s.nome}</b><span className="muted">{s.mangueiras} mangueiras</span></div>
                    <div className={ocupado ? 'neg' : 'pos'} style={{ fontSize: 14, marginTop: 2 }}>
                      {ocupado ? `Ocupado: ${s.operador}, desde ${hm(s.aberto_em)}` : 'Livre'}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        {side && (
          <section className="stack" style={{ gap: 8 }}>
            <p className="muted">Confirma que cada contador da bomba mostra este número:</p>
            {bombas.map(b => (
              <div key={b} className="reading" style={{ gap: 8 }}>
                <b>{b}</b>
                {hoses.filter(h => (h.bomba || '') === b).map(h => (
                  <div key={h.id} className="row between">
                    <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: prod[h.product_id]?.cor }} />{h.codigo} <span className="muted">{prod[h.product_id]?.nome}</span></span>
                    <Meter value={h.leitura_actual} size="sm" />
                  </div>
                ))}
              </div>
            ))}
          </section>
        )}

        {history.length > 0 && (
          <section className="panel" style={{ marginTop: 10 }}>
            <div className="panel-head"><h3>Os meus últimos turnos</h3></div>
            <table className="t"><tbody>{history.map(s => {
              const d = Number(s.diferenca)
              return (
                <tr key={s.id}><td><b>#{s.id}</b> <span className="muted">{sides.find(x => x.side_id === s.side_id)?.nome} · {dtt(s.aberto_em)}</span></td><td><EstadoTag estado={s.estado} /></td>
                  <td className={`right num ${d < 0 ? 'neg' : d > 0 ? 'pos' : ''}`}>{d === 0 ? 'Certo' : (d > 0 ? '+' : '') + mt(d)}</td></tr>
              )
            })}</tbody></table>
          </section>
        )}
      </div>
      {sides.length > 0 && <div className="op-foot"><div>
        <Btn big disabled={!side || busy || !hoses.length} onClick={abrir}>{busy ? 'A abrir…' : chosen ? `Abrir turno no ${chosen.nome}` : 'Escolhe o lado'}</Btn>
      </div></div>}
    </>
  )
}

// ---------------------------------------------------------------- Turno aberto
function OpenShift({ shiftId, refs, onClosed }) {
  const [tab, setTab] = useState('credito')
  const { data, loading, error, reload } = useData(() => loadShift(shiftId), [shiftId])
  const prod = byId(refs.products), hoses = byId(refs.hoses), cli = byId(refs.clients)

  if (loading && !data) return <Loading />
  if (error) return <div className="op-body"><ErrorNote error={error} onRetry={reload} /></div>
  const ctx = { ...data, prod, hoses, cli, refs, reload }

  return (
    <div className="op-body" style={{ paddingTop: 0 }}>
      <div className="tabs" style={{ position: 'sticky', top: 56, background: 'var(--paper)', zIndex: 10, marginBottom: 0 }}>
        <button className={`tab ${tab === 'credito' ? 'on' : ''}`} onClick={() => setTab('credito')}>Crédito ({data.credit.length})</button>
        <button className={`tab ${tab === 'outras' ? 'on' : ''}`} onClick={() => setTab('outras')}>Outras vendas</button>
        <button className={`tab ${tab === 'fecho' ? 'on' : ''}`} onClick={() => setTab('fecho')}>Fecho</button>
      </div>
      {tab === 'credito' && <CreditTab {...ctx} />}
      {tab === 'outras' && <OtherTab {...ctx} />}
      {tab === 'fecho' && <CloseTab {...ctx} onClosed={onClosed} />}
    </div>
  )
}

function CreditTab({ shift, credit, prod, cli, refs, reload }) {
  const act = useAction()
  const [novo, setNovo] = useState(false)
  const total = credit.reduce((a, c) => a + Number(c.total), 0)
  const apagar = (c) => confirmar(`Apagar o lançamento de ${cli[c.client_id]?.nome} (${mt(c.total)})?`) &&
    act(() => q(supabase.from('credit_sales').delete().eq('id', c.id)), 'Lançamento apagado').then(ok => ok && reload())
  return (
    <>
      <Btn big icon="plus" onClick={() => setNovo(true)}>Novo lançamento a crédito</Btn>
      {credit.length === 0 ? <Empty title="Nenhum lançamento neste turno">Regista aqui cada abastecimento a crédito, com a requisição do cliente.</Empty> : (
        <section className="panel">
          <div className="panel-head"><h3>Lançamentos do turno</h3><div className="spacer" /><b className="num">{mt(total)}</b></div>
          <table className="t"><tbody>{credit.slice().reverse().map(c => (
            <tr key={c.id}>
              <td><b>{cli[c.client_id]?.nome}</b>
                <div className="muted" style={{ fontSize: 13 }}>{n2(c.quantidade)} {prod[c.product_id]?.unidade} {prod[c.product_id]?.nome} · {[c.requisicao && 'Req. ' + c.requisicao, c.matricula].filter(Boolean).join(' · ')}</div></td>
              <td className="right num"><b>{mt(c.total)}</b></td>
              <td style={{ width: 40 }}><button className="x" aria-label="Apagar" onClick={() => apagar(c)}>✕</button></td>
            </tr>
          ))}</tbody></table>
        </section>
      )}
      {novo && <OpCreditForm shift={shift} refs={refs} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); reload() }} />}
    </>
  )
}

function OpCreditForm({ shift, refs, onClose, onSaved }) {
  const toast = useToast()
  const clients = refs.clients.filter(c => c.activo)
  const fuels = refs.products.filter(p => p.activo && p.tipo === 'combustivel')
  const [f, setF] = useState({ client_id: '', product_id: fuels[0]?.id || '', modo: 'litros', qtd: '', requisicao: '', matricula: '', motorista: '' })
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  const p = fuels.find(x => x.id === Number(f.product_id))
  const preco = Number(p?.preco || 0)
  const num = parseNum(f.qtd) || 0
  const litros = f.modo === 'litros' ? num : preco ? Math.round((num / preco) * 100) / 100 : 0
  const total = Math.round(litros * preco * 100) / 100
  const lista = clients.filter(c => !busca || c.nome.toLowerCase().includes(busca.toLowerCase()))

  useEffect(() => {
    setStatus(null)
    if (!f.client_id) return
    q(supabase.rpc('client_credit_status', { p_client_id: Number(f.client_id) })).then(r => setStatus(r?.[0] || null)).catch(() => {})
  }, [f.client_id])
  const limite = Number(status?.limite_credito || 0)
  const passa = limite > 0 && Number(status?.saldo || 0) + total > limite

  async function save(e) {
    e.preventDefault(); setErr(null)
    if (!f.client_id) return setErr('Escolhe o cliente.')
    if (!litros || litros <= 0) return setErr('Indica a quantidade.')
    if (passa && !confirmar('Este cliente vai passar o limite de crédito. Registar mesmo assim?')) return
    setBusy(true)
    try {
      await q(supabase.from('credit_sales').insert({
        client_id: Number(f.client_id), shift_id: shift.id, data: today(), product_id: Number(f.product_id), quantidade: litros,
        requisicao: f.requisicao.trim() || null, matricula: f.matricula.trim().toUpperCase() || null, motorista: f.motorista.trim() || null,
      }))
      toast('Lançamento registado')
      onSaved()
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="Novo lançamento a crédito" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <Field label="Cliente">
          {clients.length > 8 && <Input placeholder="Procurar cliente" value={busca} onChange={e => setBusca(e.target.value)} style={{ marginBottom: 6 }} />}
          <Select required value={f.client_id} onChange={set('client_id')} size={clients.length > 8 ? 5 : undefined}>
            {clients.length <= 8 && <option value="">Escolher cliente…</option>}
            {lista.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </Field>
        {passa && <div className="note err">Atenção: com este abastecimento o cliente passa o limite de crédito ({mt(limite)}).</div>}
        <Field label="Produto">
          <Select required value={f.product_id} onChange={set('product_id')}>{fuels.map(x => <option key={x.id} value={x.id}>{x.nome} — {mt(x.preco)}/{x.unidade}</option>)}</Select>
        </Field>
        <div className="row" role="radiogroup" aria-label="Registar por">
          <label className="check"><input type="radio" name="modo" checked={f.modo === 'litros'} onChange={() => setF(x => ({ ...x, modo: 'litros' }))} />Por quantidade</label>
          <label className="check"><input type="radio" name="modo" checked={f.modo === 'valor'} onChange={() => setF(x => ({ ...x, modo: 'valor' }))} />Por valor (MT)</label>
        </div>
        <Field label={f.modo === 'litros' ? `Quantidade (${p?.unidade || 'L'})` : 'Valor abastecido (MT)'}>
          <Input className="big" required value={f.qtd} onChange={set('qtd')} inputMode="decimal" />
        </Field>
        <div className="grid2">
          <Field label="Nº requisição"><Input value={f.requisicao} onChange={set('requisicao')} /></Field>
          <Field label="Matrícula"><Input value={f.matricula} onChange={set('matricula')} autoCapitalize="characters" /></Field>
        </div>
        <Field label="Motorista"><Input value={f.motorista} onChange={set('motorista')} /></Field>
        <div className="kv total"><span>{n2(litros)} {p?.unidade} × {n2(preco)}</span><span className="num">{mt(total)}</span></div>
        {err && <div className="note err">{err}</div>}
        <Btn big disabled={busy} onClick={save}>{busy ? 'A guardar…' : 'Registar lançamento'}</Btn>
      </form>
    </Modal>
  )
}

function OtherTab({ shift, other, prod, refs, reload }) {
  const act = useAction()
  const items = refs.products.filter(p => p.activo && p.tipo !== 'combustivel')
  const [f, setF] = useState({ product_id: items[0]?.id || '', qtd: '1' })
  const total = other.reduce((a, o) => a + Number(o.total), 0)
  async function add(e) {
    e.preventDefault()
    const qtd = parseNum(f.qtd)
    if (!qtd || qtd <= 0) return
    if (await act(() => q(supabase.from('other_sales').insert({ shift_id: shift.id, product_id: Number(f.product_id), quantidade: qtd })), 'Venda registada')) {
      setF(x => ({ ...x, qtd: '1' })); reload()
    }
  }
  const apagar = (o) => confirmar('Apagar esta venda?') && act(() => q(supabase.from('other_sales').delete().eq('id', o.id)), 'Venda apagada').then(ok => ok && reload())
  if (!items.length) return <Empty title="Sem produtos de loja">O administrador pode registar lubrificantes e outros produtos em Configuração.</Empty>
  return (
    <>
      <form className="panel panel-body stack" onSubmit={add}>
        <p className="muted">Lubrificantes e outros produtos vendidos a pronto neste turno.</p>
        <Field label="Produto"><Select value={f.product_id} onChange={e => setF(x => ({ ...x, product_id: e.target.value }))}>{items.map(p => <option key={p.id} value={p.id}>{p.nome} — {mt(p.preco)}</option>)}</Select></Field>
        <Field label="Quantidade"><Input className="big" value={f.qtd} onChange={e => setF(x => ({ ...x, qtd: e.target.value }))} inputMode="decimal" /></Field>
        <button className="btn big">Registar venda</button>
      </form>
      {other.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h3>Vendido neste turno</h3><div className="spacer" /><b className="num">{mt(total)}</b></div>
          <table className="t"><tbody>{other.map(o => (
            <tr key={o.id}><td>{n2(o.quantidade)} × {prod[o.product_id]?.nome}</td><td className="right num"><b>{mt(o.total)}</b></td>
              <td style={{ width: 40 }}><button className="x" aria-label="Apagar" onClick={() => apagar(o)}>✕</button></td></tr>
          ))}</tbody></table>
        </section>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Fecho
function CloseTab({ shift, readings, cash, totals, prod, hoses, reload, onClosed }) {
  const act = useAction()
  const [finals, setFinals] = useState(() => Object.fromEntries(readings.map(r => [r.id, r.leitura_final == null ? '' : String(r.leitura_final)])))
  const [cf, setCf] = useState({ metodo: 'numerario', tipo: 'entrada', valor: '', referencia: '', notas: '' })
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const rows = useMemo(() => readings.map(r => {
    const fin = parseNum(finals[r.id])
    const litros = fin == null ? null : fin - Number(r.leitura_inicial)
    return { ...r, fin, litros, valor: litros == null ? null : litros * Number(r.preco), bad: fin != null && fin < Number(r.leitura_inicial) }
  }), [readings, finals])
  const missing = rows.filter(r => r.fin == null)
  const bad = rows.filter(r => r.bad)
  const bomba = rows.reduce((a, r) => a + (r.valor || 0), 0)
  const live = { ...totals, total_bomba: bomba }
  live.total_esperado = bomba + Number(totals.total_outras) - Number(totals.total_credito)
  live.diferenca = Number(totals.total_declarado) - live.total_esperado

  async function saveReading(r) {
    const fin = parseNum(finals[r.id])
    if (fin == null || fin === Number(r.leitura_final)) return true
    if (fin < Number(r.leitura_inicial)) return false
    return act(() => q(supabase.from('shift_readings').update({ leitura_final: fin }).eq('id', r.id)))
  }
  async function addCash(e) {
    e.preventDefault()
    const valor = parseNum(cf.valor)
    if (!valor || valor <= 0) return
    if (await act(() => q(supabase.from('cash_entries').insert({ shift_id: shift.id, metodo: cf.metodo, tipo: cf.tipo, valor, referencia: cf.referencia.trim() || null, notas: cf.notas.trim() || null })), 'Valor registado')) {
      setCf({ metodo: 'numerario', tipo: 'entrada', valor: '', referencia: '', notas: '' }); reload()
    }
  }
  const delCash = (c) => confirmar(`Apagar ${METODOS_CAIXA[c.metodo]} de ${mt(c.valor)}?`) &&
    act(() => q(supabase.from('cash_entries').delete().eq('id', c.id)), 'Apagado').then(ok => ok && reload())

  async function fechar() {
    setBusy(true)
    for (const r of readings) { if (!(await saveReading(r))) { setBusy(false); return } }
    const ok = await act(() => q(supabase.rpc('close_shift', { p_shift_id: shift.id })))
    setBusy(false)
    if (ok) {
      const s = await q(supabase.from('shifts').select('*').eq('id', shift.id).single()).catch(() => ({ ...shift, ...live }))
      onClosed(s)
    }
  }

  return (
    <>
      <section className="stack" style={{ gap: 10 }}>
        <h2>1. Leituras finais</h2>
        <p className="muted">Escreve o número que cada contador mostra agora.</p>
        {rows.map(r => (
          <div key={r.id} className="reading">
            <div className="row" style={{ gap: 6 }}><span className="dot" style={{ background: prod[r.product_id]?.cor }} /><b>{hoses[r.hose_id]?.codigo}</b><span className="muted">{hoses[r.hose_id]?.bomba} · {prod[r.product_id]?.nome} · {n2(r.preco)} MT/L</span></div>
            <div className="row between"><span className="muted">Inicial</span><Meter value={r.leitura_inicial} size="sm" /></div>
            <Field label="Final">
              <Input className="big num" inputMode="decimal" value={finals[r.id]} placeholder={n2(r.leitura_inicial)}
                onChange={e => setFinals(x => ({ ...x, [r.id]: e.target.value }))} onBlur={() => saveReading(r)} />
            </Field>
            {r.bad ? <div className="note err">A leitura final não pode ser menor que a inicial ({n2(r.leitura_inicial)}).</div>
              : r.litros != null && <div className="row between"><span>{lt(r.litros)}</span><b className="num">{mt(r.valor)}</b></div>}
          </div>
        ))}
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <h2>2. Valores entregues</h2>
        <p className="muted">Numerário, M-Pesa, e-Mola e POS recebidos, e despesas pagas com dinheiro da caixa.</p>
        <form className="panel panel-body stack" onSubmit={addCash}>
          <div className="grid2">
            <Field label="Forma"><Select value={cf.metodo} onChange={e => setCf(x => ({ ...x, metodo: e.target.value }))}>{Object.entries(METODOS_CAIXA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Tipo"><Select value={cf.tipo} onChange={e => setCf(x => ({ ...x, tipo: e.target.value }))}><option value="entrada">Recebido</option><option value="despesa">Despesa paga</option></Select></Field>
          </div>
          <Field label="Valor (MT)"><Input className="big" inputMode="decimal" value={cf.valor} onChange={e => setCf(x => ({ ...x, valor: e.target.value }))} /></Field>
          <div className="grid2">
            <Field label="Referência"><Input value={cf.referencia} onChange={e => setCf(x => ({ ...x, referencia: e.target.value }))} /></Field>
            <Field label="Notas"><Input value={cf.notas} onChange={e => setCf(x => ({ ...x, notas: e.target.value }))} /></Field>
          </div>
          <button className="btn">Adicionar valor</button>
        </form>
        <div className="panel panel-body"><CashList cash={cash} onDelete={delCash} /></div>
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <h2>3. Resumo</h2>
        <div className="panel panel-body"><ShiftTotals totals={live} /></div>
      </section>

      <div className="op-foot"><div>
        <Btn big disabled={busy || missing.length > 0 || bad.length > 0} onClick={() => setConfirm(true)}>
          {missing.length ? `Falta a leitura de ${missing.length} mangueira${missing.length > 1 ? 's' : ''}` : 'Fechar turno'}
        </Btn>
      </div></div>

      {confirm && (
        <Modal title="Fechar o turno?" onClose={() => setConfirm(false)} footer={<>
          <Btn variant="secondary" onClick={() => setConfirm(false)}>Voltar</Btn>
          <Btn disabled={busy} onClick={fechar}>{busy ? 'A fechar…' : 'Confirmar e fechar'}</Btn>
        </>}>
          <div className="stack">
            <ShiftTotals totals={live} />
            <p className="muted">Depois de fechar não podes alterar este turno. Os contadores finais passam a ser os iniciais do próximo turno.</p>
          </div>
        </Modal>
      )}
    </>
  )
}

function ClosedScreen({ shift, side, onOk }) {
  const d = Number(shift.diferenca)
  return (
    <div className="op-body" style={{ justifyContent: 'center' }}>
      <div className="stack" style={{ textAlign: 'center', alignItems: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 32, background: 'var(--green-soft)', color: 'var(--green)', display: 'grid', placeItems: 'center' }}><Icon name="check" size={34} /></div>
        <h1>Turno #{shift.id} fechado</h1>
        {side && <b>{side}</b>}
        <p className="muted">{dt(shift.aberto_em)} · {duration(shift.aberto_em, shift.fechado_em)}</p>
      </div>
      <div className="panel panel-body"><ShiftTotals totals={shift} /></div>
      {d < 0 && <div className="note err">Falta {mt(-d)}. Fala com o gerente.</div>}
      <Btn big onClick={onOk}>Terminar</Btn>
    </div>
  )
}
