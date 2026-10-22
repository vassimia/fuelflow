import { useState } from 'react'
import { supabase, q } from '../lib/supabase.js'
import { useData } from '../lib/hooks.js'
import { getProducts, getProfiles, getClients, getHoses, getTanks, getSides, byId } from '../lib/refs.js'
import { mt, lt, n2, dt, monthStart, today, toISODate, dayStart, dayEnd, downloadCSV } from '../lib/format.js'
import { PageHead, Loading, ErrorNote, Empty, Btn, Field, Input } from '../components/ui.jsx'

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

export default function Reports() {
  const [per, setPer] = useState({ de: monthStart(), ate: today() })
  const { data, loading, error, reload } = useData(async () => {
    const [products, profiles, clients, hoses, tanks, shifts, sales, payments, deliveries, sides, usage] = await Promise.all([
      getProducts(), getProfiles(), getClients(), getHoses(), getTanks(),
      q(supabase.from('shifts').select('*').neq('estado', 'aberto').gte('fechado_em', dayStart(per.de)).lte('fechado_em', dayEnd(per.ate))),
      q(supabase.from('credit_sales').select('client_id, product_id, quantidade, total').gte('data', per.de).lte('data', per.ate)),
      q(supabase.from('payments').select('client_id, valor').gte('data', per.de).lte('data', per.ate)),
      q(supabase.from('tank_deliveries').select('tank_id, quantidade').gte('data', per.de).lte('data', per.ate)),
      getSides(),
      q(supabase.from('tank_usage').select('tank_id, litros').gte('created_at', dayStart(per.de)).lte('created_at', dayEnd(per.ate))),
    ])
    const ids = shifts.map(s => s.id)
    let readings = [], other = []
    for (const part of chunk(ids, 150)) {
      const [r, o] = await Promise.all([
        q(supabase.from('shift_readings').select('shift_id, hose_id, product_id, litros, valor').in('shift_id', part)),
        q(supabase.from('other_sales').select('shift_id, product_id, quantidade, total').in('shift_id', part)),
      ])
      readings = readings.concat(r); other = other.concat(o)
    }
    return { products, profiles, clients, hoses, tanks, shifts, readings, other, sales, payments, deliveries, sides, usage }
  }, [per.de, per.ate])

  const set = (k) => (e) => setPer(p => ({ ...p, [k]: e.target.value }))
  const head = (
    <>
      <PageHead title="Relatórios" sub="Com base nos turnos fechados no período." />
      <div className="panel panel-body row" style={{ alignItems: 'flex-end' }}>
        <Field label="De"><Input type="date" value={per.de} onChange={set('de')} /></Field>
        <Field label="Até"><Input type="date" value={per.ate} onChange={set('ate')} /></Field>
      </div>
    </>
  )
  if (loading && !data) return <div className="stack">{head}<Loading /></div>
  if (error) return <div className="stack">{head}<ErrorNote error={error} onRetry={reload} /></div>

  const { products, profiles, clients, hoses, tanks, shifts, readings, other, sales, payments, deliveries, sides, usage } = data
  const prod = byId(products), prof = byId(profiles), cli = byId(clients), hose = byId(hoses)
  const tag = `${per.de}_${per.ate}`

  // 1. Por produto
  const porProd = {}
  const addP = (pid, qtd, val) => { porProd[pid] = porProd[pid] || { qtd: 0, valor: 0 }; porProd[pid].qtd += Number(qtd); porProd[pid].valor += Number(val) }
  readings.forEach(r => addP(r.product_id, r.litros, r.valor))
  other.forEach(o => addP(o.product_id, o.quantidade, o.total))
  const prodRows = Object.entries(porProd).sort((a, b) => b[1].valor - a[1].valor)
  const totVendas = prodRows.reduce((a, [, v]) => a + v.valor, 0)

  // 2. Por dia
  const dayOf = Object.fromEntries(shifts.map(s => [s.id, toISODate(s.fechado_em)]))
  const fuels = products.filter(p => p.tipo === 'combustivel')
  const porDia = {}
  readings.forEach(r => {
    const d = dayOf[r.shift_id]; porDia[d] = porDia[d] || { valor: 0, l: {} }
    porDia[d].l[r.product_id] = (porDia[d].l[r.product_id] || 0) + Number(r.litros); porDia[d].valor += Number(r.valor)
  })
  other.forEach(o => { const d = dayOf[o.shift_id]; porDia[d] = porDia[d] || { valor: 0, l: {} }; porDia[d].valor += Number(o.total) })
  const dias = Object.keys(porDia).sort()

  // 2b. Por lado
  const sideOf = Object.fromEntries(shifts.map(s => [s.id, s.side_id]))
  const porLado = Object.fromEntries(sides.map(x => [x.id, { n: 0, vendas: 0, credito: 0, dif: 0, l: {} }]))
  shifts.forEach(s => { const o = porLado[s.side_id]; if (!o) return; o.n++; o.vendas += Number(s.total_bomba) + Number(s.total_outras); o.credito += Number(s.total_credito); o.dif += Number(s.diferenca) })
  readings.forEach(r => { const o = porLado[sideOf[r.shift_id]]; if (o) o.l[r.product_id] = (o.l[r.product_id] || 0) + Number(r.litros) })

  // 3. Por operador
  const porOp = {}
  shifts.forEach(s => {
    const o = porOp[s.operador_id] = porOp[s.operador_id] || { n: 0, vendas: 0, credito: 0, dif: 0, faltas: 0 }
    o.n++; o.vendas += Number(s.total_bomba) + Number(s.total_outras); o.credito += Number(s.total_credito); o.dif += Number(s.diferenca)
    if (Number(s.diferenca) < 0) o.faltas++
  })

  // 4. Crédito por cliente
  const porCli = {}
  sales.forEach(s => { porCli[s.client_id] = porCli[s.client_id] || { cred: 0, pago: 0 }; porCli[s.client_id].cred += Number(s.total) })
  payments.forEach(p => { porCli[p.client_id] = porCli[p.client_id] || { cred: 0, pago: 0 }; porCli[p.client_id].pago += Number(p.valor) })
  const cliRows = Object.entries(porCli).sort((a, b) => b[1].cred - a[1].cred)

  // 5. Stock por tanque
  const saidas = {}
  usage.forEach(u => { saidas[u.tank_id] = (saidas[u.tank_id] || 0) + Number(u.litros) })
  const entradas = {}
  deliveries.forEach(d => { entradas[d.tank_id] = (entradas[d.tank_id] || 0) + Number(d.quantidade) })

  return (
    <div className="stack" style={{ gap: 18 }}>
      {head}
      <div className="figures">
        <div><div className="v">{mt(totVendas)}</div><div className="l">Vendas totais</div></div>
        <div><div className="v">{lt(readings.reduce((a, r) => a + Number(r.litros), 0))}</div><div className="l">Litros vendidos</div></div>
        <div><div className="v">{mt(sales.reduce((a, s) => a + Number(s.total), 0))}</div><div className="l">Vendido a crédito</div></div>
        <div><div className="v">{shifts.length}</div><div className="l">Turnos fechados</div></div>
      </div>

      <Section title="Por lado" onCSV={() => downloadCSV(`lados_${tag}.csv`, [['Lado', 'Turnos', ...fuels.map(p => p.nome + ' (L)'), 'Vendas', 'Crédito', 'Diferença'], ...sides.map(x => [x.nome, porLado[x.id].n, ...fuels.map(p => porLado[x.id].l[p.id] || 0), porLado[x.id].vendas, porLado[x.id].credito, porLado[x.id].dif])])}>
        <table className="t"><thead><tr><th>Lado</th><th className="right">Turnos</th>{fuels.map(p => <th key={p.id} className="right">{p.nome}</th>)}<th className="right">Vendas</th><th className="right">Crédito</th><th className="right">Diferença</th></tr></thead>
          <tbody>{sides.map(x => { const o = porLado[x.id]; return (
            <tr key={x.id}><td><b>{x.nome}</b></td><td className="right num">{o.n}</td>{fuels.map(p => <td key={p.id} className="right num">{lt(o.l[p.id] || 0)}</td>)}
              <td className="right num"><b>{mt(o.vendas)}</b></td><td className="right num">{mt(o.credito)}</td><td className={`right num ${o.dif < 0 ? 'neg' : ''}`}><b>{mt(o.dif)}</b></td></tr>) })}</tbody></table>
      </Section>

      <Section title="Vendas por produto" onCSV={() => downloadCSV(`vendas_produto_${tag}.csv`, [['Produto', 'Quantidade', 'Unidade', 'Valor'], ...prodRows.map(([pid, v]) => [prod[pid]?.nome, v.qtd, prod[pid]?.unidade, v.valor])])}>
        {prodRows.length === 0 ? <Empty title="Sem vendas no período" /> : (
          <table className="t"><thead><tr><th>Produto</th><th className="right">Quantidade</th><th className="right">Valor</th><th className="right">% do total</th></tr></thead>
            <tbody>{prodRows.map(([pid, v]) => <tr key={pid}><td><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: prod[pid]?.cor }} />{prod[pid]?.nome}</span></td>
              <td className="right num">{n2(v.qtd)} {prod[pid]?.unidade}</td><td className="right num"><b>{mt(v.valor)}</b></td>
              <td className="right num">{totVendas ? n2(v.valor / totVendas * 100) : 0}%</td></tr>)}</tbody></table>
        )}
      </Section>

      <Section title="Vendas por dia" onCSV={() => downloadCSV(`vendas_dia_${tag}.csv`, [['Dia', ...fuels.map(p => p.nome + ' (L)'), 'Valor'], ...dias.map(d => [d, ...fuels.map(p => porDia[d].l[p.id] || 0), porDia[d].valor])])}>
        {dias.length === 0 ? <Empty title="Sem vendas no período" /> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Dia</th>{fuels.map(p => <th key={p.id} className="right">{p.nome}</th>)}<th className="right">Valor</th></tr></thead>
            <tbody>{dias.map(d => <tr key={d}><td className="num">{dt(d)}</td>{fuels.map(p => <td key={p.id} className="right num">{porDia[d].l[p.id] ? lt(porDia[d].l[p.id]) : '—'}</td>)}<td className="right num"><b>{mt(porDia[d].valor)}</b></td></tr>)}</tbody></table></div>
        )}
      </Section>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <Section title="Por operador" onCSV={() => downloadCSV(`operadores_${tag}.csv`, [['Operador', 'Turnos', 'Vendas', 'Crédito', 'Diferença', 'Turnos com falta'], ...Object.entries(porOp).map(([id, o]) => [prof[id]?.nome, o.n, o.vendas, o.credito, o.dif, o.faltas])])}>
          {Object.keys(porOp).length === 0 ? <Empty title="Sem turnos fechados" /> : (
            <table className="t"><thead><tr><th>Operador</th><th className="right">Turnos</th><th className="right">Vendas</th><th className="right">Diferença</th></tr></thead>
              <tbody>{Object.entries(porOp).map(([id, o]) => <tr key={id}><td><b>{prof[id]?.nome}</b>{o.faltas > 0 && <div className="neg" style={{ fontSize: 12 }}>{o.faltas} turno(s) com falta</div>}</td>
                <td className="right num">{o.n}</td><td className="right num">{mt(o.vendas)}</td><td className={`right num ${o.dif < 0 ? 'neg' : ''}`}><b>{mt(o.dif)}</b></td></tr>)}</tbody></table>
          )}
        </Section>

        <Section title="Stock por tanque" onCSV={() => downloadCSV(`stock_${tag}.csv`, [['Tanque', 'Entradas', 'Saídas (bombas)', 'Nível actual'], ...tanks.map(t => [t.nome, entradas[t.id] || 0, saidas[t.id] || 0, t.nivel_actual])])}>
          {tanks.length === 0 ? <Empty title="Sem tanques" /> : (
            <table className="t"><thead><tr><th>Tanque</th><th className="right">Entradas</th><th className="right">Saídas</th><th className="right">Nível actual</th></tr></thead>
              <tbody>{tanks.map(t => <tr key={t.id}><td>{t.nome} <span className="muted">{sides.find(x => x.id === t.side_id)?.nome}</span></td><td className="right num pos">{lt(entradas[t.id] || 0)}</td><td className="right num">{lt(saidas[t.id] || 0)}</td><td className="right num"><b>{lt(t.nivel_actual)}</b></td></tr>)}</tbody></table>
          )}
        </Section>
      </div>

      <Section title="Crédito por cliente" onCSV={() => downloadCSV(`credito_clientes_${tag}.csv`, [['Cliente', 'Abastecido a crédito', 'Pago no período'], ...cliRows.map(([id, v]) => [cli[id]?.nome, v.cred, v.pago])])}>
        {cliRows.length === 0 ? <Empty title="Sem movimentos de crédito no período" /> : (
          <table className="t"><thead><tr><th>Cliente</th><th className="right">Abastecido a crédito</th><th className="right">Pago no período</th></tr></thead>
            <tbody>{cliRows.map(([id, v]) => <tr key={id}><td><a href={`#/clientes/${id}`}>{cli[id]?.nome}</a></td><td className="right num">{mt(v.cred)}</td><td className="right num pos">{mt(v.pago)}</td></tr>)}</tbody></table>
        )}
      </Section>
    </div>
  )
}

function Section({ title, onCSV, children }) {
  return (
    <section className="panel">
      <div className="panel-head"><h2>{title}</h2><div className="spacer" /><Btn small variant="ghost" icon="download" onClick={onCSV}>CSV</Btn></div>
      <div className="table-wrap">{children}</div>
    </section>
  )
}
