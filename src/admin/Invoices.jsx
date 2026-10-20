import { useState } from 'react'
import { supabase, q } from '../lib/supabase.js'
import { useData } from '../lib/hooks.js'
import { getClients, getProducts, getSettings, byId } from '../lib/refs.js'
import { mt, dt } from '../lib/format.js'
import { PageHead, Loading, ErrorNote, Empty, Btn, Tag, useAction, confirmar, printDoc } from '../components/ui.jsx'
import { InvoiceDoc } from '../components/Docs.jsx'
import { InvoiceForm } from './forms.jsx'

export default function Invoices() {
  const act = useAction()
  const [novo, setNovo] = useState(false)
  const { data, loading, error, reload } = useData(async () => {
    const [invoices, clients, products, settings] = await Promise.all([
      q(supabase.from('invoices').select('*').order('emitida_em', { ascending: false }).order('id', { ascending: false }).limit(500)),
      getClients(), getProducts(), getSettings(),
    ])
    return { invoices, clients, products, settings }
  })
  const cli = byId(data?.clients)
  async function imprimir(inv) {
    const sales = await act(() => q(supabase.from('credit_sales').select('*').eq('invoice_id', inv.id).order('data')))
    if (sales) printDoc(<InvoiceDoc settings={data.settings} invoice={inv} client={cli[inv.client_id]} sales={sales} products={byId(data.products)} />)
  }
  const anular = (inv) => confirmar(`Anular a fatura ${inv.numero}? Os lançamentos voltam a ficar por faturar.`) &&
    act(() => q(supabase.rpc('cancel_invoice', { p_invoice_id: inv.id })), 'Fatura anulada').then(ok => ok && reload())
  const invs = data?.invoices || []
  return (
    <div className="stack">
      <PageHead title="Faturas" sub="Cada fatura junta os lançamentos de um cliente num período.">
        <Btn icon="plus" onClick={() => setNovo(true)} disabled={!data}>Emitir fatura</Btn>
      </PageHead>
      <ErrorNote error={error} onRetry={reload} />
      <div className="panel">
        {loading && !data ? <Loading /> : invs.length === 0 ? <Empty title="Ainda sem faturas" action={<Btn onClick={() => setNovo(true)}>Emitir a primeira fatura</Btn>} /> : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Número</th><th>Cliente</th><th>Período</th><th>Emitida</th><th>Estado</th><th className="right">Total</th><th /></tr></thead>
            <tbody>{invs.map(inv => (
              <tr key={inv.id}>
                <td><b>{inv.numero}</b></td>
                <td><a href={`#/clientes/${inv.client_id}`}>{cli[inv.client_id]?.nome}</a></td>
                <td className="num">{dt(inv.periodo_inicio)} a {dt(inv.periodo_fim)}</td>
                <td className="num">{dt(inv.emitida_em)}</td>
                <td>{inv.estado === 'anulada' ? <Tag kind="red">Anulada</Tag> : <Tag kind="fechado">Emitida</Tag>}</td>
                <td className="right num"><b>{mt(inv.total)}</b></td>
                <td className="right" style={{ whiteSpace: 'nowrap' }}>
                  <Btn small variant="ghost" icon="print" onClick={() => imprimir(inv)}>Imprimir</Btn>
                  {inv.estado !== 'anulada' && <Btn small variant="ghost" onClick={() => anular(inv)}>Anular</Btn>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {novo && <InvoiceForm clients={data.clients} onClose={() => setNovo(false)} onSaved={reload} />}
    </div>
  )
}
