import { n2, dt, METODOS_PAG } from '../lib/format.js'

function Header({ settings, title, right }) {
  const s = settings || {}
  return (
    <div className="doc-head">
      <div>
        <h1>{s.empresa || 'FuelFlow'}</h1>
        <div>{s.endereco}</div>
        <div>{[s.nuit && 'NUIT ' + s.nuit, s.contacto, s.email].filter(Boolean).join(' — ')}</div>
      </div>
      <div style={{ textAlign: 'right' }}><h1>{title}</h1>{right}</div>
    </div>
  )
}

function ClientBox({ client }) {
  return (
    <div style={{ margin: '14px 0', padding: 10, border: '1px solid #bbb' }}>
      <b>{client.nome}</b>
      {client.endereco && <div>{client.endereco}</div>}
      {client.nuit && <div>NUIT {client.nuit}</div>}
    </div>
  )
}

function Footer({ settings }) {
  const s = settings || {}
  return (
    <div style={{ marginTop: 24, fontSize: 12 }}>
      {s.rodape && <p>{s.rodape}</p>}
      {s.dados_bancarios && <p style={{ whiteSpace: 'pre-line', marginTop: 6 }}><b>Para pagamento:</b>{'\n'}{s.dados_bancarios}</p>}
    </div>
  )
}

// Extrato de conta corrente
export function StatementDoc({ settings, client, de, ate, saldoInicial, linhas, products }) {
  let saldo = saldoInicial
  const totD = linhas.reduce((a, l) => a + (l.debito || 0), 0)
  const totC = linhas.reduce((a, l) => a + (l.credito || 0), 0)
  return (
    <div className="doc">
      <Header settings={settings} title="Extrato de conta" right={<div>{dt(de)} a {dt(ate)}</div>} />
      <ClientBox client={client} />
      <table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Req.</th><th>Matrícula</th><th className="r">Débito</th><th className="r">Crédito</th><th className="r">Saldo</th></tr></thead>
        <tbody>
          <tr><td>{dt(de)}</td><td colSpan={5}><b>Saldo anterior</b></td><td className="r"><b>{n2(saldoInicial)}</b></td></tr>
          {linhas.map((l, i) => {
            saldo += (l.debito || 0) - (l.credito || 0)
            return (
              <tr key={i}>
                <td>{dt(l.data)}</td>
                <td>{l.tipo === 'venda' ? `${n2(l.quantidade)} ${products[l.product_id]?.unidade || ''} ${products[l.product_id]?.nome || ''} × ${n2(l.preco_unit)}` : `Pagamento — ${METODOS_PAG[l.metodo] || ''} ${l.referencia || ''}`}</td>
                <td>{l.requisicao || ''}</td><td>{l.matricula || ''}</td>
                <td className="r">{l.debito ? n2(l.debito) : ''}</td>
                <td className="r">{l.credito ? n2(l.credito) : ''}</td>
                <td className="r">{n2(saldo)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot><tr><td colSpan={4}><b>Totais do período</b></td><td className="r"><b>{n2(totD)}</b></td><td className="r"><b>{n2(totC)}</b></td><td className="r"><b>{n2(saldo)}</b></td></tr></tfoot>
      </table>
      <p style={{ marginTop: 12, fontSize: 15 }}><b>Saldo em dívida a {dt(ate)}: {n2(saldo)} MT</b></p>
      <Footer settings={settings} />
    </div>
  )
}

// Fatura mensal
export function InvoiceDoc({ settings, invoice, client, sales, products }) {
  // Resumo por produto e preço
  const groups = {}
  for (const s of sales) {
    const k = s.product_id + '|' + s.preco_unit
    groups[k] = groups[k] || { product_id: s.product_id, preco: Number(s.preco_unit), qtd: 0, total: 0 }
    groups[k].qtd += Number(s.quantidade); groups[k].total += Number(s.total)
  }
  return (
    <div className="doc">
      <Header settings={settings} title={`Fatura ${invoice.numero}`}
        right={<div>Data: {dt(invoice.emitida_em)}<br />Período: {dt(invoice.periodo_inicio)} a {dt(invoice.periodo_fim)}
          {invoice.estado === 'anulada' && <><br /><b>ANULADA</b></>}</div>} />
      <ClientBox client={client} />
      <table>
        <thead><tr><th>Produto</th><th className="r">Quantidade</th><th className="r">Preço unit.</th><th className="r">Total</th></tr></thead>
        <tbody>{Object.values(groups).map((g, i) => (
          <tr key={i}><td>{products[g.product_id]?.nome}</td><td className="r">{n2(g.qtd)} {products[g.product_id]?.unidade}</td><td className="r">{n2(g.preco)}</td><td className="r">{n2(g.total)}</td></tr>
        ))}</tbody>
        <tfoot><tr><td colSpan={3}><b>Total a pagar (MT)</b></td><td className="r"><b>{n2(invoice.total)}</b></td></tr></tfoot>
      </table>
      {invoice.notas && <p style={{ marginTop: 10 }}>{invoice.notas}</p>}
      <h3 style={{ marginTop: 22 }}>Detalhe dos abastecimentos</h3>
      <table>
        <thead><tr><th>Data</th><th>Req.</th><th>Matrícula</th><th>Produto</th><th className="r">Qtd</th><th className="r">Preço</th><th className="r">Total</th></tr></thead>
        <tbody>{sales.map(s => (
          <tr key={s.id}><td>{dt(s.data)}</td><td>{s.requisicao}</td><td>{s.matricula}</td><td>{products[s.product_id]?.nome}</td>
            <td className="r">{n2(s.quantidade)}</td><td className="r">{n2(s.preco_unit)}</td><td className="r">{n2(s.total)}</td></tr>
        ))}</tbody>
      </table>
      <Footer settings={settings} />
    </div>
  )
}
