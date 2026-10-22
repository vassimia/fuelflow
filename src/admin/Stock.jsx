import { useState } from 'react'
import { supabase, q } from '../lib/supabase.js'
import { useData } from '../lib/hooks.js'
import { getProducts, getTanks, getSides, getHoses, byId } from '../lib/refs.js'
import SwitchTankForm from '../components/SwitchTank.jsx'
import { mt, lt, n2, dt, dtt, today, parseNum, addDays } from '../lib/format.js'
import { PageHead, Loading, ErrorNote, Empty, Btn, Field, Input, Select, Textarea, FormModal, Tag, useAction, confirmar } from '../components/ui.jsx'
import TankBar from '../components/TankBar.jsx'

export default function Stock() {
  const act = useAction()
  const [modal, setModal] = useState(null)
  const [tab, setTab] = useState('ciclos')
  const { data, loading, error, reload } = useData(async () => {
    const since = addDays(today(), -90)
    const [products, tanks, deliveries, dips, sides, hoses, cycles, open] = await Promise.all([
      getProducts(), getTanks(),
      q(supabase.from('tank_deliveries').select('*').gte('data', since).order('data', { ascending: false }).order('id', { ascending: false })),
      q(supabase.from('tank_dips').select('*').order('medido_em', { ascending: false }).limit(200)),
      getSides(), getHoses(),
      q(supabase.from('tank_cycle_status').select('*').order('iniciado_em', { ascending: false }).limit(300)),
      q(supabase.from('shifts').select('id, side_id').eq('estado', 'aberto')),
    ])
    return { products, tanks, deliveries, dips, sides, hoses, cycles, open }
  })
  if (loading && !data) return <Loading />
  if (error) return <ErrorNote error={error} onRetry={reload} />
  const { products, tanks, deliveries, dips, sides, hoses, cycles, open } = data
  const prod = byId(products), sd = byId(sides)
  const tk = Object.fromEntries(tanks.map(t => [t.id, { ...t, nome: `${t.nome} (${sd[t.side_id]?.nome || ''})` }]))
  const close = () => setModal(null)
  const apagarRecepcao = (d) => confirmar(`Apagar a recepção de ${lt(d.quantidade)}? O nível do tanque baixa nesse valor.`) &&
    act(() => q(supabase.from('tank_deliveries').delete().eq('id', d.id)), 'Recepção apagada').then(ok => ok && reload())

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHead title="Tanques e stock" sub="Em cada lado trabalha um tanque de cada produto. O nível desce com os turnos e sobe com as recepções.">
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
                  <div className="row"><h3>{side.nome}</h3><div className="spacer" />
                    {ts.length > 0 && <Btn small variant="secondary" icon="tank" onClick={() => setModal({ troca: side })}>Trocar tanque</Btn>}</div>
                  {ts.length === 0 ? <p className="muted">Sem tanques registados neste lado.</p> : (
                    <div className="grid2">
                      {ts.map(t => (
                        <div key={t.id} className="stack" style={{ gap: 6, opacity: t.activo ? 1 : .5 }}>
                          <TankBar tank={t} product={prod[t.product_id]} />
                          <div className="row muted" style={{ fontSize: 13 }}>
                            {t.estado !== 'activo' && <Tag>Parado</Tag>}
                            <span>Lastro {lt(t.lastro)} · mínimo {lt(t.nivel_minimo)}</span><div className="spacer" />
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
          <button className={`tab ${tab === 'ciclos' ? 'on' : ''}`} onClick={() => setTab('ciclos')}>Ciclos e perdas</button>
          <button className={`tab ${tab === 'recepcoes' ? 'on' : ''}`} onClick={() => setTab('recepcoes')}>Recepções (90 dias)</button>
          <button className={`tab ${tab === 'medicoes' ? 'on' : ''}`} onClick={() => setTab('medicoes')}>Medições</button>
        </div>
        {tab === 'ciclos' && <Cycles cycles={cycles} sides={sd} products={prod} />}
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

      {modal?.troca && <SwitchTankForm sideId={modal.troca.id} sideName={modal.troca.nome} shiftId={open.find(o => o.side_id === modal.troca.id)?.id}
        tanks={tanks} hoses={hoses} products={products} onClose={close} onSaved={() => { close(); reload() }} />}
      {modal?.tanque !== undefined && <TankForm tank={modal.tanque} products={products} sides={sides} onClose={close} onSaved={reload} />}
      {modal === 'recepcao' && <DeliveryForm tanks={Object.values(tk).filter(t => t.activo)} onClose={close} onSaved={reload} />}
      {modal === 'medicao' && <DipForm tanks={Object.values(tk).filter(t => t.activo)} onClose={close} onSaved={reload} />}
    </div>
  )
}

function TankForm({ tank, products, sides, onClose, onSaved }) {
  const [f, setF] = useState({
    side_id: tank?.side_id || (sides.length === 1 ? sides[0].id : ''), nome: tank?.nome || '', product_id: tank?.product_id || '', lastro: tank?.lastro ?? 200, capacidade: tank?.capacidade ?? '',
    nivel_minimo: tank?.nivel_minimo ?? '', nivel_actual: tank?.nivel_actual ?? '', activo: tank?.activo ?? true,
  })
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  async function save() {
    const row = { side_id: Number(f.side_id), nome: f.nome.trim(), product_id: Number(f.product_id), capacidade: parseNum(f.capacidade) || 0, nivel_minimo: parseNum(f.nivel_minimo) || 0, lastro: parseNum(f.lastro) ?? 200, activo: f.activo }
    if (tank) await q(supabase.from('tanks').update(row).eq('id', tank.id))
    else await q(supabase.from('tanks').insert({ ...row, nivel_actual: parseNum(f.nivel_actual) || 0 }))
    onSaved()
    return tank ? 'Tanque actualizado' : 'Tanque registado'
  }
  return (
    <FormModal title={tank ? 'Editar tanque' : 'Novo tanque'} onClose={onClose} onSubmit={save}>
      <Field label="Lado"><Select required value={f.side_id} onChange={set('side_id')} disabled={!!tank}><option value="">Escolher…</option>
        {sides.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</Select></Field>
      <Field label="Nome"><Input required value={f.nome} onChange={set('nome')} placeholder="ex.: Tanque 1 — Gasóleo" /></Field>
      <Field label="Produto"><Select required value={f.product_id} onChange={set('product_id')} disabled={!!tank}><option value="">Escolher…</option>
        {products.filter(p => p.tipo === 'combustivel').map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</Select></Field>
      <div className="grid2">
        <Field label="Capacidade (L)"><Input value={f.capacidade} onChange={set('capacidade')} inputMode="decimal" /></Field>
        <Field label="Nível mínimo (alerta)"><Input value={f.nivel_minimo} onChange={set('nivel_minimo')} inputMode="decimal" /></Field>
      </div>
      {!tank && <Field label="Nível actual (L)" hint="Medição de hoje. Depois só muda com turnos, recepções e medições."><Input value={f.nivel_actual} onChange={set('nivel_actual')} inputMode="decimal" /></Field>}
      <Field label="Lastro (L)" hint="O que fica no fundo e a bomba já não chupa. Aparece como sobra sugerida na troca."><Input value={f.lastro} onChange={set('lastro')} inputMode="decimal" /></Field>
      {!tank && <p className="muted" style={{ fontSize: 13 }}>Se for o primeiro tanque deste produto no lado, fica logo a trabalhar. Os outros ficam parados até haver uma troca.</p>}
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

function Cycles({ cycles, sides, products }) {
  if (!cycles.length) return <section className="panel"><Empty title="Ainda sem ciclos">Um ciclo começa quando um tanque é ligado e termina na troca seguinte.</Empty></section>
  const pct = (perda, vend) => Number(vend) > 0 ? n2(Number(perda) / Number(vend) * 100) + '%' : '—'
  return (
    <section className="panel">
      <div className="panel-body muted" style={{ fontSize: 14 }}>Perda = nível ao ligar + recepções − litros tirados pelas bombas − sobra medida na troca. Positivo quer dizer que falta combustível.</div>
      <div className="table-wrap"><table className="t">
        <thead><tr><th>Tanque</th><th>Ligado</th><th>Desligado</th><th className="right">Ao ligar</th><th className="right">Recepções</th><th className="right">Bombas tiraram</th><th className="right">Sobra</th><th className="right">Perda</th><th className="right">%</th></tr></thead>
        <tbody>{cycles.map(c => {
          const aberto = !c.terminado_em
          const perda = Number(c.perda || 0)
          return (
            <tr key={c.id}>
              <td><b>{c.tank_nome}</b><div className="muted" style={{ fontSize: 12 }}>{sides[c.side_id]?.nome} · {products[c.product_id]?.nome}</div></td>
              <td className="num">{dtt(c.iniciado_em)}</td>
              <td className="num">{aberto ? <Tag kind="aberto">A trabalhar</Tag> : dtt(c.terminado_em)}</td>
              <td className="right num">{lt(c.nivel_inicial)}</td>
              <td className="right num">{aberto ? '—' : lt(c.entradas)}</td>
              <td className="right num">{lt(aberto ? c.vendido_ate_agora : c.vendido)}</td>
              <td className="right num">{aberto ? '—' : lt(c.sobra)}</td>
              <td className={`right num ${!aberto && perda > 0 ? 'neg' : !aberto && perda < 0 ? 'pos' : ''}`}><b>{aberto ? '—' : lt(perda)}</b></td>
              <td className="right num">{aberto ? '—' : pct(perda, c.vendido)}</td>
            </tr>
          )
        })}</tbody>
      </table></div>
    </section>
  )
}
