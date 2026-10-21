import { supabase, q } from '../lib/supabase.js'
import { useData } from '../lib/hooks.js'
import { getProducts, getTanks, getProfiles, getSides, byId } from '../lib/refs.js'
import { mt, lt, n0, dt, hm, duration, addDays, today, monthStart, toISODate , dayStart, dayEnd } from '../lib/format.js'
import { PageHead, Loading, ErrorNote, Empty, Btn, EstadoTag } from '../components/ui.jsx'
import TankBar from '../components/TankBar.jsx'

export default function Dashboard({ go }) {
  const { data, loading, error, reload } = useData(async () => {
    const since = addDays(today(), -6)
    const [products, tanks, profiles, balances, openShifts, recent, monthShifts, sides] = await Promise.all([
      getProducts(), getTanks(), getProfiles(),
      q(supabase.from('client_balances').select('*').gt('saldo', 0).order('saldo', { ascending: false })),
      q(supabase.from('shifts').select('*').eq('estado', 'aberto').order('aberto_em')),
      q(supabase.from('shifts').select('id, fechado_em, total_bomba, total_outras, total_credito').neq('estado', 'aberto').gte('fechado_em', dayStart(since))),
      q(supabase.from('shifts').select('diferenca').neq('estado', 'aberto').gte('fechado_em', dayStart(monthStart()))),
      getSides(),
    ])
    const ids = recent.map(s => s.id)
    const readings = ids.length ? await q(supabase.from('shift_readings').select('shift_id, product_id, litros, valor').in('shift_id', ids)) : []
    return { products, tanks, profiles: byId(profiles), balances, openShifts, recent, readings, monthShifts, sides }
  })

  if (loading && !data) return <Loading />
  if (error) return <ErrorNote error={error} onRetry={reload} />
  const { products, tanks, profiles, balances, openShifts, recent, readings, monthShifts, sides } = data
  const prodById = byId(products)
  const fuels = products.filter(p => p.tipo === 'combustivel')

  // Últimos 7 dias por data de fecho
  const shiftDay = Object.fromEntries(recent.map(s => [s.id, toISODate(s.fechado_em)]))
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), -i))
  const grid = Object.fromEntries(days.map(d => [d, { valor: 0, litros: {} }]))
  for (const r of readings) {
    const d = grid[shiftDay[r.shift_id]]
    if (!d) continue
    d.litros[r.product_id] = (d.litros[r.product_id] || 0) + Number(r.litros)
  }
  for (const s of recent) {
    const d = grid[toISODate(s.fechado_em)]
    if (d) d.valor += Number(s.total_bomba) + Number(s.total_outras)
  }
  const hoje = grid[today()]
  const litrosHoje = Object.values(hoje.litros).reduce((a, b) => a + b, 0)
  const divida = balances.reduce((a, b) => a + Number(b.saldo), 0)
  const difMes = monthShifts.reduce((a, b) => a + Number(b.diferenca), 0)
  const lowTanks = tanks.filter(t => t.activo && Number(t.nivel_actual) <= Number(t.nivel_minimo))

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHead title="Painel" sub={new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}>
        <Btn variant="secondary" onClick={reload}>Actualizar</Btn>
      </PageHead>

      <div className="figures">
        <div><div className="v">{mt(hoje.valor)}</div><div className="l">Vendas hoje (turnos fechados)</div></div>
        <div><div className="v">{lt(litrosHoje)}</div><div className="l">Litros vendidos hoje</div></div>
        <div><div className="v">{mt(divida)}</div><div className="l">Dívida de clientes</div></div>
        <div><div className={`v ${difMes < 0 ? 'neg' : ''}`}>{mt(difMes)}</div><div className="l">Diferenças de caixa este mês</div></div>
      </div>

      {lowTanks.length > 0 && (
        <div className="note warn">Abaixo do nível mínimo: {lowTanks.map(t => `${t.nome} (${lt(t.nivel_actual)})`).join(', ')}</div>
      )}

      <div className="grid2" style={{ alignItems: 'start' }}>
        <section className="panel">
          <div className="panel-head"><h2>Lados agora</h2><div className="spacer" /><Btn small variant="ghost" onClick={() => go('turnos')}>Ver turnos</Btn></div>
          <table className="t"><tbody>
            {sides.filter(x => x.activo).map(side => {
              const s = openShifts.find(o => o.side_id === side.id)
              return (
                <tr key={side.id} className={s ? 'click' : ''} onClick={() => s && go('turnos/' + s.id)}>
                  <td><b>{side.nome}</b>{s && <div className="muted" style={{ fontSize: 13 }}>{profiles[s.operador_id]?.nome || '—'} · turno #{s.id} desde {hm(s.aberto_em)}</div>}</td>
                  <td className="right num">{s ? duration(s.aberto_em) : ''}</td>
                  <td className="right">{s ? <EstadoTag estado="aberto" /> : <span className="muted">Sem turno</span>}</td>
                </tr>
              )
            })}
          </tbody></table>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Tanques</h2><div className="spacer" /><Btn small variant="ghost" onClick={() => go('stock')}>Gerir</Btn></div>
          <div className="panel-body stack">
            {tanks.filter(t => t.activo).length === 0 ? <Empty title="Sem tanques registados" action={<Btn small onClick={() => go('stock')}>Registar tanque</Btn>} /> :
              sides.map(side => {
                const ts = tanks.filter(t => t.activo && t.side_id === side.id)
                if (!ts.length) return null
                return <div key={side.id} className="stack" style={{ gap: 10 }}><h3>{side.nome}</h3>{ts.map(t => <TankBar key={t.id} tank={t} product={prodById[t.product_id]} />)}</div>
              })}
          </div>
        </section>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <section className="panel">
          <div className="panel-head"><h2>Últimos 7 dias</h2></div>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Dia</th>{fuels.map(p => <th key={p.id} className="right">{p.nome}</th>)}<th className="right">Vendas</th></tr></thead>
              <tbody>
                {days.map(d => (
                  <tr key={d}>
                    <td>{d === today() ? 'Hoje' : dt(d)}</td>
                    {fuels.map(p => <td key={p.id} className="right num">{grid[d].litros[p.id] ? n0(grid[d].litros[p.id]) + ' L' : '—'}</td>)}
                    <td className="right num">{grid[d].valor ? mt(grid[d].valor) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Maiores devedores</h2><div className="spacer" /><Btn small variant="ghost" onClick={() => go('clientes')}>Todos os clientes</Btn></div>
          {balances.length === 0 ? <Empty title="Nenhum cliente em dívida" /> : (
            <table className="t"><tbody>
              {balances.slice(0, 6).map(c => {
                const over = Number(c.limite_credito) > 0 && Number(c.saldo) > Number(c.limite_credito)
                return (
                  <tr key={c.id} className="click" onClick={() => go('clientes/' + c.id)}>
                    <td><b>{c.nome}</b>{over && <div className="neg" style={{ fontSize: 13 }}>Acima do limite de {mt(c.limite_credito)}</div>}</td>
                    <td className="right num"><b>{mt(c.saldo)}</b></td>
                  </tr>
                )
              })}
            </tbody></table>
          )}
        </section>
      </div>
    </div>
  )
}
