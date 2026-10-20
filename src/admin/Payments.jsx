import { useState } from 'react'
import { supabase, q } from '../lib/supabase.js'
import { useData } from '../lib/hooks.js'
import { getClients, byId } from '../lib/refs.js'
import { mt, dt, monthStart, today, downloadCSV, METODOS_PAG } from '../lib/format.js'
import { PageHead, Loading, ErrorNote, Empty, Btn, Field, Input, Select, useAction, confirmar } from '../components/ui.jsx'
import { PaymentForm } from './forms.jsx'

export default function Payments() {
  const act = useAction()
  const [f, setF] = useState({ de: monthStart(), ate: today(), cliente: '' })
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  const [novo, setNovo] = useState(false)
  const { data, loading, error, reload } = useData(async () => {
    let qq = supabase.from('payments').select('*').gte('data', f.de).lte('data', f.ate).order('data', { ascending: false })
    if (f.cliente) qq = qq.eq('client_id', f.cliente)
    const [payments, clients] = await Promise.all([q(qq), getClients()])
    return { payments, clients }
  }, [f.de, f.ate, f.cliente])
  const cli = byId(data?.clients)
  const pays = data?.payments || []
  const total = pays.reduce((a, p) => a + Number(p.valor), 0)
  const apagar = (p) => confirmar(`Apagar o pagamento de ${mt(p.valor)}?`) &&
    act(() => q(supabase.from('payments').delete().eq('id', p.id)), 'Pagamento apagado').then(ok => ok && reload())
  const exportar = () => downloadCSV(`pagamentos_${f.de}_${f.ate}.csv`, [
    ['Data', 'Cliente', 'Valor', 'Forma', 'Referência', 'Notas'],
    ...pays.map(p => [p.data, cli[p.client_id]?.nome, p.valor, METODOS_PAG[p.metodo], p.referencia, p.notas]),
  ])
  return (
    <div className="stack">
      <PageHead title="Pagamentos de clientes" sub={data ? `${pays.length} pagamentos · ${mt(total)}` : ''}>
        <Btn variant="secondary" icon="download" onClick={exportar} disabled={!pays.length}>Exportar CSV</Btn>
        <Btn icon="plus" onClick={() => setNovo(true)} disabled={!data}>Registar pagamento</Btn>
      </PageHead>
      <div className="panel panel-body row" style={{ alignItems: 'flex-end' }}>
        <Field label="De"><Input type="date" value={f.de} onChange={set('de')} /></Field>
        <Field label="Até"><Input type="date" value={f.ate} onChange={set('ate')} /></Field>
        <Field label="Cliente"><Select value={f.cliente} onChange={set('cliente')}><option value="">Todos</option>{(data?.clients || []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</Select></Field>
      </div>
      <ErrorNote error={error} onRetry={reload} />
      <div className="panel">
        {loading && !data ? <Loading /> : pays.length === 0 ? <Empty title="Sem pagamentos neste período" /> : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Data</th><th>Cliente</th><th>Forma</th><th>Referência</th><th>Notas</th><th className="right">Valor</th><th /></tr></thead>
            <tbody>{pays.map(p => (
              <tr key={p.id}>
                <td className="num">{dt(p.data)}</td>
                <td><a href={`#/clientes/${p.client_id}`}>{cli[p.client_id]?.nome}</a></td>
                <td>{METODOS_PAG[p.metodo]}</td><td>{p.referencia || '—'}</td><td className="muted">{p.notas || ''}</td>
                <td className="right num"><b>{mt(p.valor)}</b></td>
                <td className="right"><button className="x" aria-label="Apagar" onClick={() => apagar(p)}>✕</button></td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={5}>Total</td><td className="right num">{mt(total)}</td><td /></tr></tfoot>
          </table></div>
        )}
      </div>
      {novo && <PaymentForm clients={data.clients.filter(c => c.activo)} onClose={() => setNovo(false)} onSaved={reload} />}
    </div>
  )
}
