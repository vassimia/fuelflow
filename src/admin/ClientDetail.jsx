import { useState } from 'react'
import { supabase, q } from '../lib/supabase.js'
import { useData } from '../lib/hooks.js'
import { getProducts, getClients, getSettings, byId } from '../lib/refs.js'
import { mt, n2, dt, monthStart, today, downloadCSV, METODOS_PAG } from '../lib/format.js'
import { Loading, ErrorNote, Btn, Field, Input, Tag, Empty, useAction, confirmar, printDoc } from '../components/ui.jsx'
import { StatementDoc, InvoiceDoc } from '../components/Docs.jsx'
import { ClientForm, CreditSaleForm, PaymentForm, InvoiceForm } from './forms.jsx'

export default function ClientDetail({ id, go }) {
  const act = useAction()
  const [per, setPer] = useState({ de: monthStart(), ate: today() })
  const [tab, setTab] = useState('extrato')
  const [modal, setModal] = useState(null)

  const { data, loading, error, reload } = useData(async () => {
    const [client, bal, products, clients, settings, sales, payments, invoices] = await Promise.all([
      q(supabase.from('clients').select('*').eq('id', id).single()),
      q(supabase.from('client_balances').select('*').eq('id', id).single()),
      getProducts(), getClients(), getSettings(),
      q(supabase.from('credit_sales').select('*').eq('client_id', id).order('data').order('created_at')),
      q(supabase.from('payments').select('*').eq('client_id', id).order('data').order('created_at')),
      q(supabase.from('invoices').select('*').eq('client_id', id).order('emitida_em', { ascending: false })),
    ])
    return { client, bal, products, clients, settings, sales, payments, invoices }
  }, [id])

  if (loading && !data) return <Loading />
  if (error) return <ErrorNote error={error} onRetry={reload} />
  const { client, bal, products, clients, settings, sales, payments, invoices } = data
  const prod = byId(products)

  // Extrato do período
  const antes = (d) => d < per.de
  const dentro = (d) => d >= per.de && d <= per.ate
  const saldoInicial = sales.filter(s => antes(s.data)).reduce((a, s) => a + Number(s.total), 0)
    - payments.filter(p => antes(p.data)).reduce((a, p) => a + Number(p.valor), 0)
  const linhas = [
    ...sales.filter(s => dentro(s.data)).map(s => ({ ...s, tipo: 'venda', debito: Number(s.total) })),
    ...payments.filter(p => dentro(p.data)).map(p => ({ ...p, tipo: 'pagamento', credito: Number(p.valor) })),
  ].sort((a, b) => a.data.localeCompare(b.data) || a.created_at.localeCompare(b.created_at))
  let running = saldoInicial
  const withSaldo = linhas.map(l => { running += (l.debito || 0) - (l.credito || 0); return { ...l, saldo: running } })

  const saldo = Number(bal.saldo)
  const over = Number(client.limite_credito) > 0 && saldo > Number(client.limite_credito)
  const close = () => setModal(null)

  const imprimirExtrato = () => printDoc(<StatementDoc settings={settings} client={client} de={per.de} ate={per.ate} saldoInicial={saldoInicial} linhas={linhas} products={prod} />)
  const imprimirFatura = (inv) => printDoc(<InvoiceDoc settings={settings} invoice={inv} client={client} sales={sales.filter(s => s.invoice_id === inv.id)} products={prod} />)
  const exportar = () => downloadCSV(`extrato_${client.nome}_${per.de}_${per.ate}.csv`, [
    ['Data', 'Tipo', 'Descrição', 'Requisição', 'Matrícula', 'Débito', 'Crédito', 'Saldo'],
    ['', '', 'Saldo anterior', '', '', '', '', saldoInicial],
    ...withSaldo.map(l => [l.data, l.tipo, l.tipo === 'venda' ? `${l.quantidade} ${prod[l.product_id]?.nome}` : `${METODOS_PAG[l.metodo]} ${l.referencia || ''}`,
      l.requisicao || '', l.matricula || '', l.debito || '', l.credito || '', l.saldo]),
  ])

  const apagarVenda = (s) => confirmar('Apagar este lançamento?') &&
    act(() => q(supabase.from('credit_sales').delete().eq('id', s.id)), 'Lançamento apagado').then(ok => ok && reload())
  const apagarPag = (p) => confirmar(`Apagar o pagamento de ${mt(p.valor)}?`) &&
    act(() => q(supabase.from('payments').delete().eq('id', p.id)), 'Pagamento apagado').then(ok => ok && reload())
  const anular = (inv) => confirmar(`Anular a fatura ${inv.numero}? Os lançamentos voltam a ficar por faturar.`) &&
    act(() => q(supabase.rpc('cancel_invoice', { p_invoice_id: inv.id })), 'Fatura anulada').then(ok => ok && reload())

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <Btn variant="ghost" icon="back" onClick={() => go('clientes')}>Clientes</Btn>
        <div className="page-head" style={{ marginTop: 6 }}>
          <div>
            <div className="row"><h1>{client.nome}</h1>{!client.activo && <Tag>Inactivo</Tag>}</div>
            <p>{[client.nuit && 'NUIT ' + client.nuit, client.contacto, client.endereco].filter(Boolean).join(' · ') || 'Sem dados de contacto'}</p>
          </div>
          <div className="spacer" />
          <Btn variant="secondary" icon="edit" onClick={() => setModal('editar')}>Editar</Btn>
        </div>
      </div>

      <div className="figures">
        <div><div className={`v ${over ? 'neg' : ''}`}>{mt(saldo)}</div><div className="l">Saldo em dívida{over ? ' — acima do limite' : ''}</div></div>
        <div><div className="v">{Number(client.limite_credito) ? mt(client.limite_credito) : '—'}</div><div className="l">Limite de crédito</div></div>
        <div><div className="v">{dt(bal.ultimo_lancamento)}</div><div className="l">Último abastecimento</div></div>
        <div><div className="v">{dt(bal.ultimo_pagamento)}</div><div className="l">Último pagamento</div></div>
      </div>

      <div className="row">
        <Btn icon="plus" onClick={() => setModal('venda')}>Novo lançamento</Btn>
        <Btn icon="payment" onClick={() => setModal('pagamento')}>Registar pagamento</Btn>
        <Btn variant="secondary" icon="invoice" onClick={() => setModal('fatura')}>Emitir fatura</Btn>
      </div>

      <div>
        <div className="tabs">
          <button className={`tab ${tab === 'extrato' ? 'on' : ''}`} onClick={() => setTab('extrato')}>Extrato</button>
          <button className={`tab ${tab === 'faturas' ? 'on' : ''}`} onClick={() => setTab('faturas')}>Faturas ({invoices.length})</button>
        </div>

        {tab === 'extrato' && (
          <section className="panel">
            <div className="panel-head" style={{ alignItems: 'flex-end' }}>
              <Field label="De"><Input type="date" value={per.de} onChange={e => setPer(p => ({ ...p, de: e.target.value }))} /></Field>
              <Field label="Até"><Input type="date" value={per.ate} onChange={e => setPer(p => ({ ...p, ate: e.target.value }))} /></Field>
              <div className="spacer" />
              <Btn variant="secondary" icon="download" onClick={exportar}>CSV</Btn>
              <Btn variant="secondary" icon="print" onClick={imprimirExtrato}>Imprimir extrato</Btn>
            </div>
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Data</th><th>Descrição</th><th>Req.</th><th>Matrícula</th><th className="right">Débito</th><th className="right">Crédito</th><th className="right">Saldo</th><th /></tr></thead>
                <tbody>
                  <tr><td className="num">{dt(per.de)}</td><td colSpan={5}><b>Saldo anterior</b></td><td className="right num"><b>{mt(saldoInicial)}</b></td><td /></tr>
                  {withSaldo.map(l => (
                    <tr key={l.tipo + l.id}>
                      <td className="num">{dt(l.data)}</td>
                      <td>{l.tipo === 'venda'
                        ? <>{n2(l.quantidade)} {prod[l.product_id]?.unidade} {prod[l.product_id]?.nome} × {n2(l.preco_unit)}{l.invoice_id && <Tag kind="fechado">{invoices.find(i => i.id === l.invoice_id)?.numero || 'Faturado'}</Tag>}</>
                        : <span className="pos">Pagamento {METODOS_PAG[l.metodo]} {l.referencia || ''}</span>}</td>
                      <td>{l.requisicao || ''}</td>
                      <td>{l.matricula || ''}</td>
                      <td className="right num">{l.debito ? mt(l.debito) : ''}</td>
                      <td className="right num pos">{l.credito ? mt(l.credito) : ''}</td>
                      <td className="right num"><b>{mt(l.saldo)}</b></td>
                      <td className="right" style={{ whiteSpace: 'nowrap' }}>
                        {l.tipo === 'venda' ? <>
                          <button className="x" aria-label="Editar" onClick={() => setModal({ venda: l })}>✎</button>
                          {!l.invoice_id && <button className="x" aria-label="Apagar" onClick={() => apagarVenda(l)}>✕</button>}
                        </> : <button className="x" aria-label="Apagar" onClick={() => apagarPag(l)}>✕</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {withSaldo.length === 0 && <Empty title="Sem movimentos neste período" />}
            </div>
          </section>
        )}

        {tab === 'faturas' && (
          <section className="panel">
            {invoices.length === 0 ? <Empty title="Ainda sem faturas" action={<Btn onClick={() => setModal('fatura')}>Emitir fatura</Btn>}>As faturas juntam os lançamentos de um período.</Empty> : (
              <table className="t">
                <thead><tr><th>Número</th><th>Período</th><th>Emitida</th><th>Estado</th><th className="right">Total</th><th /></tr></thead>
                <tbody>{invoices.map(inv => (
                  <tr key={inv.id}>
                    <td><b>{inv.numero}</b></td>
                    <td className="num">{dt(inv.periodo_inicio)} a {dt(inv.periodo_fim)}</td>
                    <td className="num">{dt(inv.emitida_em)}</td>
                    <td>{inv.estado === 'anulada' ? <Tag kind="red">Anulada</Tag> : <Tag kind="fechado">Emitida</Tag>}</td>
                    <td className="right num"><b>{mt(inv.total)}</b></td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      <Btn small variant="ghost" icon="print" onClick={() => imprimirFatura(inv)}>Imprimir</Btn>
                      {inv.estado !== 'anulada' && <Btn small variant="ghost" onClick={() => anular(inv)}>Anular</Btn>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
        )}
      </div>

      {modal === 'editar' && <ClientForm client={client} onClose={close} onSaved={reload} />}
      {modal === 'venda' && <CreditSaleForm clients={clients} products={products} clientId={id} onClose={close} onSaved={reload} />}
      {modal?.venda && <CreditSaleForm sale={modal.venda} clients={clients} products={products} onClose={close} onSaved={reload} />}
      {modal === 'pagamento' && <PaymentForm clients={clients} clientId={id} saldo={saldo} onClose={close} onSaved={reload} />}
      {modal === 'fatura' && <InvoiceForm clients={clients} clientId={id} onClose={close} onSaved={() => { reload(); setTab('faturas') }} />}
    </div>
  )
}
