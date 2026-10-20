import { supabase, q } from '../lib/supabase.js'
import { useData } from '../lib/hooks.js'
import { loadShift, getHoses, getProducts, getClients, getProfiles, byId } from '../lib/refs.js'
import { mt, lt, n2, dtt, duration, parseNum, METODOS_CAIXA } from '../lib/format.js'
import { Loading, ErrorNote, Btn, EstadoTag, useAction, confirmar, printDoc } from '../components/ui.jsx'
import { ShiftReadings, ShiftTotals, CashList } from '../components/ShiftReport.jsx'

export default function ShiftDetail({ id, go }) {
  const act = useAction()
  const { data, loading, error, reload } = useData(async () => {
    const [s, hoses, products, clients, profiles] = await Promise.all([loadShift(id), getHoses(), getProducts(), getClients(), getProfiles()])
    return { ...s, hoses: byId(hoses), products: byId(products), clients: byId(clients), profiles: byId(profiles) }
  }, [id])

  if (loading && !data) return <Loading />
  if (error) return <ErrorNote error={error} onRetry={reload} />
  const { shift, readings, credit, other, cash, totals, hoses, products, clients, profiles } = data
  const aberto = shift.estado === 'aberto'
  const litros = readings.reduce((a, r) => a + Number(r.litros), 0)

  const run = async (fn, msg) => { if (await act(fn, msg)) reload() }
  const fechar = () => confirmar('Fechar este turno? Os contadores e o stock dos tanques serão actualizados.') &&
    run(() => q(supabase.rpc('close_shift', { p_shift_id: id })), 'Turno fechado')
  const validar = () => run(() => q(supabase.rpc('validate_shift', { p_shift_id: id })), 'Turno validado')
  const reabrir = () => confirmar('Reabrir o turno? Os contadores voltam aos valores iniciais e o stock é reposto até voltar a fechar.') &&
    run(() => q(supabase.rpc('reopen_shift', { p_shift_id: id })), 'Turno reaberto')
  const editarFinal = (r) => {
    const v = window.prompt(`Leitura final de ${hoses[r.hose_id]?.codigo}`, r.leitura_final ?? r.leitura_inicial)
    const n = parseNum(v)
    if (v == null) return
    if (n == null || n < Number(r.leitura_inicial)) return alert('A leitura final tem de ser um número igual ou maior que a inicial.')
    run(() => q(supabase.from('shift_readings').update({ leitura_final: n }).eq('id', r.id)), 'Leitura guardada')
  }
  const apagar = (table, row, what) => confirmar(`Apagar ${what}?`) &&
    run(() => q(supabase.from(table).delete().eq('id', row.id)), 'Apagado')
  const guardarNotas = () => {
    const v = window.prompt('Notas do turno', shift.notas || '')
    if (v != null) run(() => q(supabase.from('shifts').update({ notas: v }).eq('id', id)), 'Notas guardadas')
  }

  const operador = profiles[shift.operador_id]?.nome || '—'
  const imprimir = () => printDoc(<ShiftDoc {...data} operador={operador} />)

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <Btn variant="ghost" icon="back" onClick={() => go('turnos')}>Turnos</Btn>
        <div className="page-head" style={{ marginTop: 6 }}>
          <div>
            <div className="row"><h1>Turno #{shift.id}</h1><EstadoTag estado={shift.estado} /></div>
            <p>{operador} · {dtt(shift.aberto_em)}{shift.fechado_em ? ` até ${dtt(shift.fechado_em)}` : ' (em curso)'} · {duration(shift.aberto_em, shift.fechado_em)}</p>
          </div>
          <div className="spacer" />
          <div className="row">
            <Btn variant="secondary" icon="print" onClick={imprimir}>Imprimir</Btn>
            <Btn variant="secondary" icon="edit" onClick={guardarNotas}>Notas</Btn>
            {aberto && <Btn onClick={fechar}>Fechar turno</Btn>}
            {shift.estado === 'fechado' && <Btn variant="secondary" onClick={reabrir}>Reabrir</Btn>}
            {shift.estado === 'fechado' && <Btn icon="check" onClick={validar}>Validar</Btn>}
            {shift.estado === 'validado' && <Btn variant="secondary" onClick={reabrir}>Reabrir</Btn>}
          </div>
        </div>
        {shift.notas && <div className="note">{shift.notas}</div>}
        {aberto && <div className="note warn" style={{ marginTop: 8 }}>Turno em curso: os valores abaixo são provisórios. O operador fecha o turno no telemóvel, ou podes fechá-lo aqui.</div>}
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Leituras das mangueiras</h2><div className="spacer" /><span className="num muted">{lt(litros)} no total</span></div>
        <ShiftReadings readings={readings} hoses={hoses} products={products} />
        {aberto && (
          <div className="panel-body row">
            {readings.map(r => <Btn key={r.id} small variant="secondary" icon="edit" onClick={() => editarFinal(r)}>Final {hoses[r.hose_id]?.codigo}</Btn>)}
          </div>
        )}
      </section>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <section className="panel">
          <div className="panel-head"><h2>Lançamentos a crédito</h2><div className="spacer" /><b className="num">{mt(credit.reduce((a, c) => a + Number(c.total), 0))}</b></div>
          {credit.length === 0 ? <div className="panel-body muted">Nenhum lançamento neste turno.</div> : (
            <div className="table-wrap"><table className="t"><tbody>
              {credit.map(c => (
                <tr key={c.id}>
                  <td><b className="click" onClick={() => go('clientes/' + c.client_id)} style={{ cursor: 'pointer' }}>{clients[c.client_id]?.nome}</b>
                    <div className="muted" style={{ fontSize: 13 }}>{[c.requisicao && 'Req. ' + c.requisicao, c.matricula, c.motorista].filter(Boolean).join(' · ')}</div></td>
                  <td className="num">{n2(c.quantidade)} {products[c.product_id]?.unidade} {products[c.product_id]?.nome}</td>
                  <td className="right num"><b>{mt(c.total)}</b></td>
                  <td style={{ width: 40 }}>{!c.invoice_id && <button className="x" aria-label="Apagar" onClick={() => apagar('credit_sales', c, 'este lançamento')}>✕</button>}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Fecho de caixa</h2></div>
          <div className="panel-body stack">
            <ShiftTotals totals={totals} />
          </div>
        </section>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <section className="panel">
          <div className="panel-head"><h2>Valores entregues</h2></div>
          <div className="panel-body"><CashList cash={cash} onDelete={(c) => apagar('cash_entries', c, 'este valor')} /></div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Outras vendas</h2></div>
          <div className="panel-body">
            {other.length === 0 ? <p className="muted">Nenhuma.</p> : (
              <table className="t"><tbody>
                {other.map(o => (
                  <tr key={o.id}>
                    <td>{n2(o.quantidade)} × {products[o.product_id]?.nome}</td>
                    <td className="right num"><b>{mt(o.total)}</b></td>
                    <td style={{ width: 40 }}><button className="x" aria-label="Apagar" onClick={() => apagar('other_sales', o, 'esta venda')}>✕</button></td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function ShiftDoc({ shift, readings, credit, other, cash, totals, hoses, products, clients, operador }) {
  return (
    <div className="doc">
      <div className="doc-head"><div><h1>Fecho de turno #{shift.id}</h1><div>{operador}</div></div>
        <div style={{ textAlign: 'right' }}>{dtt(shift.aberto_em)}<br />até {dtt(shift.fechado_em)}</div></div>
      <table><thead><tr><th>Mangueira</th><th>Produto</th><th className="r">Inicial</th><th className="r">Final</th><th className="r">Litros</th><th className="r">Preço</th><th className="r">Valor</th></tr></thead>
        <tbody>{readings.map(r => <tr key={r.id}><td>{hoses[r.hose_id]?.codigo}</td><td>{products[r.product_id]?.nome}</td>
          <td className="r">{n2(r.leitura_inicial)}</td><td className="r">{n2(r.leitura_final)}</td><td className="r">{n2(r.litros)}</td><td className="r">{n2(r.preco)}</td><td className="r">{n2(r.valor)}</td></tr>)}</tbody></table>
      {credit.length > 0 && <table><thead><tr><th>Crédito — cliente</th><th>Req.</th><th>Matrícula</th><th className="r">Qtd</th><th className="r">Total</th></tr></thead>
        <tbody>{credit.map(c => <tr key={c.id}><td>{clients[c.client_id]?.nome}</td><td>{c.requisicao}</td><td>{c.matricula}</td><td className="r">{n2(c.quantidade)} {products[c.product_id]?.nome}</td><td className="r">{n2(c.total)}</td></tr>)}</tbody></table>}
      {other.length > 0 && <table><thead><tr><th>Outras vendas</th><th className="r">Qtd</th><th className="r">Total</th></tr></thead>
        <tbody>{other.map(o => <tr key={o.id}><td>{products[o.product_id]?.nome}</td><td className="r">{n2(o.quantidade)}</td><td className="r">{n2(o.total)}</td></tr>)}</tbody></table>}
      <table><thead><tr><th>Valores entregues</th><th className="r">Valor</th></tr></thead>
        <tbody>{cash.map(c => <tr key={c.id}><td>{METODOS_CAIXA[c.metodo]}{c.tipo === 'despesa' ? ' (despesa)' : ''} {c.referencia || ''} {c.notas || ''}</td><td className="r">{n2(c.valor)}</td></tr>)}</tbody></table>
      <table style={{ width: '50%', marginLeft: 'auto' }}><tbody>
        <tr><td>Vendas nas bombas</td><td className="r">{n2(totals.total_bomba)}</td></tr>
        <tr><td>Outras vendas</td><td className="r">{n2(totals.total_outras)}</td></tr>
        <tr><td>Crédito</td><td className="r">− {n2(totals.total_credito)}</td></tr>
        <tr><td><b>A entregar</b></td><td className="r"><b>{n2(totals.total_esperado)}</b></td></tr>
        <tr><td>Entregue</td><td className="r">{n2(totals.total_declarado)}</td></tr>
        <tr><td><b>Diferença</b></td><td className="r"><b>{n2(totals.diferenca)}</b></td></tr>
      </tbody></table>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 50 }}>
        <div>Operador: ______________________</div><div>Gerente: ______________________</div>
      </div>
    </div>
  )
}

export { ShiftDoc }
