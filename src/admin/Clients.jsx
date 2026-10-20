import { useState } from 'react'
import { supabase, q } from '../lib/supabase.js'
import { useData } from '../lib/hooks.js'
import { mt, dt, downloadCSV } from '../lib/format.js'
import { PageHead, Loading, ErrorNote, Empty, Btn, Input, Tag } from '../components/ui.jsx'
import { ClientForm } from './forms.jsx'

export default function Clients({ go }) {
  const [busca, setBusca] = useState('')
  const [inactivos, setInactivos] = useState(false)
  const [novo, setNovo] = useState(false)
  const { data, loading, error, reload } = useData(() => q(supabase.from('client_balances').select('*').order('nome')))

  const all = data || []
  const lista = all.filter(c => (inactivos || c.activo) &&
    (!busca || `${c.nome} ${c.nuit || ''} ${c.contacto || ''}`.toLowerCase().includes(busca.toLowerCase())))
  const divida = lista.reduce((a, c) => a + Math.max(0, Number(c.saldo)), 0)

  const exportar = () => downloadCSV('clientes_saldos.csv', [
    ['Cliente', 'NUIT', 'Contacto', 'Limite', 'Total crédito', 'Total pago', 'Saldo', 'Último lançamento', 'Último pagamento'],
    ...lista.map(c => [c.nome, c.nuit, c.contacto, c.limite_credito, c.total_credito, c.total_pago, c.saldo, c.ultimo_lancamento, c.ultimo_pagamento]),
  ])

  return (
    <div className="stack">
      <PageHead title="Clientes a crédito" sub={data ? `${lista.length} clientes · ${mt(divida)} em dívida` : ''}>
        <Btn variant="secondary" icon="download" onClick={exportar} disabled={!lista.length}>Exportar CSV</Btn>
        <Btn icon="plus" onClick={() => setNovo(true)}>Novo cliente</Btn>
      </PageHead>

      <div className="row">
        <Input placeholder="Procurar por nome, NUIT ou contacto" value={busca} onChange={e => setBusca(e.target.value)} style={{ maxWidth: 380 }} />
        <label className="check"><input type="checkbox" checked={inactivos} onChange={e => setInactivos(e.target.checked)} />Mostrar inactivos</label>
      </div>

      <ErrorNote error={error} onRetry={reload} />
      <div className="panel">
        {loading && !data ? <Loading /> : lista.length === 0 ? (
          <Empty title={all.length ? 'Nenhum cliente encontrado' : 'Ainda não há clientes'} action={!all.length && <Btn icon="plus" onClick={() => setNovo(true)}>Criar o primeiro cliente</Btn>}>
            {!all.length && 'Cria aqui as empresas que abastecem a crédito.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Cliente</th><th>NUIT</th><th>Contacto</th><th>Último lançamento</th><th className="right">Limite</th><th className="right">Saldo em dívida</th></tr></thead>
              <tbody>
                {lista.map(c => {
                  const over = Number(c.limite_credito) > 0 && Number(c.saldo) > Number(c.limite_credito)
                  return (
                    <tr key={c.id} className="click" onClick={() => go('clientes/' + c.id)}>
                      <td><b>{c.nome}</b> {!c.activo && <Tag>Inactivo</Tag>}</td>
                      <td className="num">{c.nuit || '—'}</td>
                      <td>{c.contacto || '—'}</td>
                      <td className="num">{dt(c.ultimo_lancamento)}</td>
                      <td className="right num">{Number(c.limite_credito) ? mt(c.limite_credito) : <span className="muted">sem limite</span>}</td>
                      <td className={`right num ${over ? 'neg' : ''}`}><b>{mt(c.saldo)}</b>{over && <div style={{ fontSize: 12 }}>acima do limite</div>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {novo && <ClientForm onClose={() => setNovo(false)} onSaved={reload} />}
    </div>
  )
}
