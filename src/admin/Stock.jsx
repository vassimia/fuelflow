import { useState } from 'react'
import { supabase, q } from '../lib/supabase.js'
import { useData } from '../lib/hooks.js'
import { getProducts, getTanks, getSides, byId } from '../lib/refs.js'
import { mt, lt, n2, dt, dtt, today, parseNum, addDays } from '../lib/format.js'
import { PageHead, Loading, ErrorNote, Empty, Btn, Field, Input, Select, Textarea, FormModal, useAction, confirmar } from '../components/ui.jsx'
import TankBar from '../components/TankBar.jsx'

export default function Stock() {
  const act = useAction()
  const [modal, setModal] = useState(null)
  const [tab, setTab] = useState('recepcoes')
  const { data, loading, error, reload } = useData(async () => {
    const since = addDays(today(), -90)
    const [products, tanks, deliveries, dips, sides] = await Promise.all([
      getProducts(), getTanks(),
      q(supabase.from('tank_deliveries').select('*').gte('data', since).order('data', { ascending: false }).order('id', { ascending: false })),
      q(supabase.from('tank_dips').select('*').order('medido_em', { ascending: false }).limit(200)),
      getSides(),
    ])
    return { products, tanks, deliveries, dips, sides }
  })
  if (loading && !data) return <Loading />
  if (error) return <ErrorNote error={error} onRetry={reload} />
  const { products, tanks, deliveries, dips, sides } = data
  const prod = byId(products), sd = byId(sides)
  const tk = Object.fromEntries(tanks.map(t => [t.id, { ...t, nome: `${t.nome} (${sd[t.side_id]?.nome || ''})` }]))
  const close = () => setModal(null)
  const apagarRecepcao = (d) => confirmar(`Apagar a recepção de ${lt(d.quantidade)}? O nível do tanque baixa nesse valor.`) &&
    act(() => q(supabase.from('tank_deliveries').delete().eq('id', d.id)), 'Recepção apagada').then(ok => ok && reload())

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHead title="Tanques e stock" sub="O nível desce com cada turno fechado e sobe com cada recepção.">
        <Btn variant="secondary" icon="plus" onClick={() => setModal({ tanque: null })}>Novo tanque</Btn>
        <Btn variant="secondary" onClick={() => setModal('medicao')} disabled={!tanks.length}>Registar medição</Btn>
        <Btn icon="plus" onClick={() => setModal('recepcao')} disabled={!tanks.length}>Registar recepção</Btn>
      </PageHead>

      <section className="panel">
        {tanks.length === 0 ? <Empty title="Ainda sem tanques" action={<Btn icon="plus" onClick={() => setModal({ tanque: null })}>Registar tanque</Btn>}>Regista cada tanque com o produto e a capacidade.</Empty> : (
          <div className="panel-body stack" style={{ gap: 22 }}>
            {sides.map(side => {
              const ts = tanks.filter(t => t.side_id === side.id)
              return (
                <div key={side.id} className="stack" style={{ gap: 10 }}>
                  <h3>{side.nome}</h3>
                  {ts.length === 0 ? <p className="muted">Sem tanques registados neste lado.</p> : (
                    <div className="grid2">
                      {ts.map(t => (
                        <div key={t.id} className="stack" style={{ gap: 6, opacity: t.activo ? 1 : .5 }}>
                          <TankBar tank={t} product={prod[t.product_id]} />
                          <div className="row muted" style={{ fontSize: 13 }}>
                            <span>Mínimo {lt(t.nivel_minimo)}</span><div className="spacer" />
                            <Btn small variant="ghost" icon="edit" onClick={() => setModal({ tanque: t })}>Editar</Btn>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div>
        <div className="tabs">
          <button className={`tab ${tab === 'recepcoes' ? 'on' : ''}`} onClick={() => setTab('recepcoes')}>Recepções (90 dias)</button>
          <button className={`tab ${tab === 'medicoes' ? 'on' : ''}`} onClick={() => setTab('medicoes')}>Medições</button>
        </div>
        {tab === 'recepcoes' && (
          <section className="panel">
            {deliveries.length === 0 ? <Empty title="Sem recepções registadas" /> : (
              <div className="table-wrap"><table className="t">
                <thead><tr><th>Data</th><th>Tanque</th><th>Fornecedor</th><th>Guia</th><th className="right">Quantidade</th><th className="right">Custo/L</th><th className="right">Custo total</th><th /></tr></thead>
                <tbody>{deliveries.map(d => (
                  <tr key={d.id}>
                    <td className="num">{dt(d.data)}</td><td>{tk[d.tank_id]?.nome}</td><td>{d.fornecedor}</td><td>{d.guia || '—'}</td>
                    <td className="right num"><b>{lt(d.quantidade)}</b></td>
                    <td className="right num">{d.preco_custo ? n2(d.preco_custo) : '—'}</td>
                    <td className="right num">{d.preco_custo ? mt(d.preco_custo * d.quantidade) : '—'}</td>
                    <td className="right"><button className="x" aria-label="Apagar" onClick={() => apagarRecepcao(d)}>✕</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        )}
        {tab === 'medicoes' && (
          <section className="panel">
            {dips.length === 0 ? <Empty title="Sem medições">Regista as medições da vareta para comparar com o sistema.</Empty> : (
              <div className="table-wrap"><table className="t">
                <thead><tr><th>Quando</th><th>Tanque</th><th className="right">Sistema</th><th className="right">Medido</th><th className="right">Diferença</th><th>Ajustado</th><th>Notas</th></tr></thead>
                <tbody>{dips.map(d => (
                  <tr key={d.id}>
                    <td className="num">{dtt(d.medido_em)}</td><td>{tk[d.tank_id]?.nome}</td>
                    <td className="right num">{lt(d.nivel_sistema)}</td><td className="right num">{lt(d.nivel_medido)}</td>
                    <td className={`right num ${d.diferenca < 0 ? 'neg' : d.diferenca > 0 ? 'pos' : ''}`}><b>{lt(d.diferenca)}</b></td>
                    <td>{d.ajustar ? 'Sim' : 'Não'}</td><td className="muted">{d.notas || ''}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        )}
      </div>

      {modal?.tanque !== undefined && <TankForm tank={modal.tanque} products={products} sides={sides} onClose={close} onSaved={reload} />}
      {modal === 'recepcao' && <DeliveryForm tanks={Object.values(tk).filter(t => t.activo)} onClose={close} onSaved={reload} />}
      {modal === 'medicao' && <DipForm tanks={Object.values(tk).filter(t => t.activo)} onClose={close} onSaved={reload} />}
    </div>
  )
}

function TankForm({ tank, products, sides, onClose, onSaved }) {
  const [f, setF] = useState({
    side_id: tank?.side_id || (sides.length === 1 ? sides[0].id : ''), nome: tank?.nome || '', product_id: tank?.product_id || '', ligar: true, capacidade: tank?.capacidade ?? '',
    nivel_minimo: tank?.nivel_minimo ?? '', nivel_actual: tank?.nivel_actual ?? '', activo: tank?.activo ?? true,
  })
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  async function save() {
    const row = { side_id: Number(f.side_id), nome: f.nome.trim(), product_id: Number(f.product_id), capacidade: parseNum(f.capacidade) || 0, nivel_minimo: parseNum(f.nivel_minimo) || 0, activo: f.activo }
    let linked = 0
    if (tank) {
      // Se mudou de lado ou de produto, as mangueiras que já não batem certo ficam sem tanque
      await q(supabase.from('hoses').update({ tank_id: null }).eq('tank_id', tank.id).or(`side_id.neq.${row.side_id},product_id.neq.${row.product_id}`))
      await q(supabase.from('tanks').update(row).eq('id', tank.id))
    } else {
      const t = await q(supabase.from('tanks').insert({ ...row, nivel_actual: parseNum(f.nivel_actual) || 0 }).select().single())
      if (f.ligar) {
        const hs = await q(supabase.from('hoses').update({ tank_id: t.id }).eq('side_id', row.side_id).eq('product_id', row.product_id).is('tank_id', null).select('id'))
        linked = hs.length
      }
    }
    onSaved()
    return tank ? 'Tanque actualizado' : linked ? `Tanque registado e ligado a ${linked} mangueira${linked > 1 ? 's' : ''}` : 'Tanque registado'
  }
  return (
    <FormModal title={tank ? 'Editar tanque' : 'Novo tanque'} onClose={onClose} onSubmit={save}>
      <Field label="Lado"><Select required value={f.side_id} onChange={set('side_id')}><option value="">Escolher…</option>
        {sides.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</Select></Field>
      <Field label="Nome"><Input required value={f.nome} onChange={set('nome')} placeholder="ex.: Tanque 1 — Gasóleo" /></Field>
      <Field label="Produto"><Select required value={f.product_id} onChange={set('product_id')}><option value="">Escolher…</option>
        {products.filter(p => p.tipo === 'combustivel').map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</Select></Field>
      <div className="grid2">
        <Field label="Capacidade (L)"><Input value={f.capacidade} onChange={set('capacidade')} inputMode="decimal" /></Field>
        <Field label="Nível mínimo (alerta)"><Input value={f.nivel_minimo} onChange={set('nivel_minimo')} inputMode="decimal" /></Field>
      </div>
      {!tank && <Field label="Nível actual (L)" hint="Medição de hoje. Depois só muda com turnos, recepções e medições."><Input value={f.nivel_actual} onChange={set('nivel_actual')} inputMode="decimal" /></Field>}
      {!tank && <label className="check"><input type="checkbox" checked={f.ligar} onChange={set('ligar')} />Ligar às mangueiras deste lado e produto que ainda não têm tanque</label>}
      {tank && <label className="check"><input type="checkbox" checked={f.activo} onChange={set('activo')} />Tanque em uso</label>}
    </FormModal>
  )
}

function DeliveryForm({ tanks, onClose, onSaved }) {
  const [f, setF] = useState({ tank_id: tanks[0]?.id || '', data: today(), quantidade: '', fornecedor: 'Petromoc', guia: '', preco_custo: '', notas: '' })
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  async function save() {
    const qtd = parseNum(f.quantidade)
    if (!qtd || qtd <= 0) throw new Error('Indica a quantidade recebida.')
    await q(supabase.from('tank_deliveries').insert({
      tank_id: Number(f.tank_id), data: f.data, quantidade: qtd, fornecedor: f.fornecedor.trim() || 'Petromoc',
      guia: f.guia.trim() || null, preco_custo: parseNum(f.preco_custo), notas: f.notas.trim() || null,
    }))
    onSaved()
    return 'Recepção registada'
  }
  return (
    <FormModal title="Registar recepção de combustível" onClose={onClose} onSubmit={save} submitLabel="Registar recepção">
      <Field label="Tanque"><Select required value={f.tank_id} onChange={set('tank_id')}>{tanks.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</Select></Field>
      <div className="grid2">
        <Field label="Data"><Input type="date" required value={f.data} onChange={set('data')} /></Field>
        <Field label="Quantidade (L)"><Input required value={f.quantidade} onChange={set('quantidade')} inputMode="decimal" autoFocus /></Field>
      </div>
      <div className="grid2">
        <Field label="Fornecedor"><Input value={f.fornecedor} onChange={set('fornecedor')} /></Field>
        <Field label="Nº da guia"><Input value={f.guia} onChange={set('guia')} /></Field>
      </div>
      <Field label="Custo por litro (MT)" hint="Opcional"><Input value={f.preco_custo} onChange={set('preco_custo')} inputMode="decimal" /></Field>
      <Field label="Notas"><Textarea value={f.notas} onChange={set('notas')} /></Field>
    </FormModal>
  )
}

function DipForm({ tanks, onClose, onSaved }) {
  const [f, setF] = useState({ tank_id: tanks[0]?.id || '', nivel_medido: '', ajustar: false, notas: '' })
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const t = tanks.find(x => x.id === Number(f.tank_id))
  const med = parseNum(f.nivel_medido)
  async function save() {
    if (med == null) throw new Error('Indica o nível medido.')
    await q(supabase.from('tank_dips').insert({ tank_id: Number(f.tank_id), nivel_medido: med, ajustar: f.ajustar, notas: f.notas.trim() || null }))
    onSaved()
    return f.ajustar ? 'Medição registada e nível ajustado' : 'Medição registada'
  }
  return (
    <FormModal title="Registar medição do tanque" onClose={onClose} onSubmit={save} submitLabel="Registar medição">
      <Field label="Tanque"><Select required value={f.tank_id} onChange={set('tank_id')}>{tanks.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</Select></Field>
      <Field label="Nível medido (L)"><Input required value={f.nivel_medido} onChange={set('nivel_medido')} inputMode="decimal" autoFocus /></Field>
      {t && <div className="note">Sistema: <b className="num">{lt(t.nivel_actual)}</b>{med != null && <> · diferença <b className={`num ${med - t.nivel_actual < 0 ? 'neg' : ''}`}>{lt(med - t.nivel_actual)}</b></>}</div>}
      <label className="check"><input type="checkbox" checked={f.ajustar} onChange={set('ajustar')} />Corrigir o nível do sistema para o valor medido</label>
      <Field label="Notas"><Textarea value={f.notas} onChange={set('notas')} /></Field>
    </FormModal>
  )
}
