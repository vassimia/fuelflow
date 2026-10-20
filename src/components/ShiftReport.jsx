import { mt, lt, n2, METODOS_CAIXA } from '../lib/format.js'
import { Meter } from './ui.jsx'

// Resumo de um turno: leituras, crédito, outras vendas, caixa e totais
export function ShiftReadings({ readings, hoses, products }) {
  return (
    <div className="table-wrap">
      <table className="t">
        <thead><tr><th>Mangueira</th><th>Produto</th><th>Inicial</th><th>Final</th><th className="right">Litros</th><th className="right">Preço</th><th className="right">Valor</th></tr></thead>
        <tbody>
          {readings.map(r => (
            <tr key={r.id}>
              <td><b>{hoses[r.hose_id]?.codigo}</b><div className="muted" style={{ fontSize: 12 }}>{hoses[r.hose_id]?.bomba}</div></td>
              <td><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: products[r.product_id]?.cor }} />{products[r.product_id]?.nome}</span></td>
              <td><Meter value={r.leitura_inicial} size="sm" /></td>
              <td>{r.leitura_final == null ? <span className="muted">por ler</span> : <Meter value={r.leitura_final} size="sm" />}</td>
              <td className="right num">{lt(r.litros)}</td>
              <td className="right num">{n2(r.preco)}</td>
              <td className="right num"><b>{mt(r.valor)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ShiftTotals({ totals }) {
  const t = totals || {}
  const dif = Number(t.diferenca || 0)
  return (
    <div>
      <div className="kv"><span>Vendas nas bombas</span><b className="num">{mt(t.total_bomba)}</b></div>
      <div className="kv"><span>Outras vendas</span><b className="num">{mt(t.total_outras)}</b></div>
      <div className="kv"><span>Menos: lançamentos a crédito</span><b className="num">− {mt(t.total_credito)}</b></div>
      <div className="kv"><span>A entregar</span><b className="num">{mt(t.total_esperado)}</b></div>
      <div className="kv"><span>Entregue (caixa, electrónico e despesas)</span><b className="num">{mt(t.total_declarado)}</b></div>
      <div className="kv total">
        <span>{dif === 0 ? 'Sem diferença' : dif > 0 ? 'Sobra' : 'Falta'}</span>
        <span className={`num ${dif < 0 ? 'neg' : dif > 0 ? 'pos' : ''}`}>{mt(Math.abs(dif))}</span>
      </div>
    </div>
  )
}

export function CashList({ cash, onDelete }) {
  if (!cash.length) return <p className="muted">Nada registado.</p>
  return (
    <table className="t"><tbody>
      {cash.map(c => (
        <tr key={c.id}>
          <td>{METODOS_CAIXA[c.metodo]}{c.tipo === 'despesa' && <span className="tag red" style={{ marginLeft: 6 }}>Despesa</span>}
            {(c.referencia || c.notas) && <div className="muted" style={{ fontSize: 13 }}>{[c.referencia, c.notas].filter(Boolean).join(' — ')}</div>}</td>
          <td className="right num"><b>{mt(c.valor)}</b></td>
          {onDelete && <td className="right" style={{ width: 40 }}><button className="x" onClick={() => onDelete(c)} aria-label="Apagar">✕</button></td>}
        </tr>
      ))}
    </tbody></table>
  )
}
