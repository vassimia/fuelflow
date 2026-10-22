import { useState } from 'react'
import { supabase, q } from '../lib/supabase.js'
import { useData } from '../lib/hooks.js'
import { getProducts, getClients, getProfiles, byId } from '../lib/refs.js'
import { mt, n2, dt, monthStart, today, downloadCSV } from '../lib/format.js'
import { PageHead, Loading, ErrorNote, Empty, Btn, Field, Input, Select, Tag, useAction, confirmar } from '../components/ui.jsx'
import { CreditSaleForm } from './forms.jsx'
import { PhotoButton, AddPhotoButton } from '../components/Photo.jsx'

export default function CreditSales({ go }) {
  const act = useAction()
  const [f, setF] = useState({ de: monthStart(), ate: today(), cliente: '', produto: '', busca: '', semFoto: false })
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  const [modal, setModal] = useState(null)

  const { data, loading, error, reload } = useData(async () => {
    let qq = supabase.from('credit_sales').select('*').gte('data', f.de).lte('data', f.ate).order('data', { ascending: false }).order('created_at', { ascending: false }).limit(2000)
    if (f.cliente) qq = qq.eq('client_id', f.cliente)
    if (f.produto) qq = qq.eq('product_id', f.produto)
    const [sales, products, clients, profiles] = await Promise.all([q(qq), getProducts(), getClients(), getProfiles()])
    return { sales, products, clients, profiles }
  }, [f.de, f.ate, f.cliente, f.produto])

  const prod = byId(data?.products), cli = byId(data?.clients), prof = byId(data?.profiles)
  const term = f.busca.trim().toLowerCase()
  const sales = (data?.sales || []).filter(s => (!term || `${s.requisicao || ''} ${s.matricula || ''} ${s.motorista || ''}`.toLowerCase().includes(term)) && (!f.semFoto || !s.foto_path))
  const total = sales.reduce((a, s) => a + Number(s.total), 0)
  const porProduto = {}
  for (const s of sales) porProduto[s.product_id] = (porProduto[s.product_id] || 0) + Number(s.quantidade)

  const apagar = (s) => confirmar('Apagar este lançamento?') &&
    act(() => q(supabase.from('credit_sales').delete().eq('id', s.id)), 'Lançamento apagado').then(ok => ok && reload())

  const exportar = () => downloadCSV(`lancamentos_${f.de}_${f.ate}.csv`, [
    ['Data', 'Cliente', 'Requisição', 'Matrícula', 'Motorista', 'Produto', 'Quantidade', 'Preço', 'Total', 'Turno', 'Registado por', 'Faturado', 'Foto'],
    ...sales.map(s => [s.data, cli[s.client_id]?.nome, s.requisicao, s.matricula, s.motorista, prod[s.product_id]?.nome, s.quantidade, s.preco_unit, s.total, s.shift_id || '', prof[s.created_by]?.nome || '', s.invoice_id ? 'sim' : 'não', s.foto_path ? 'sim' : 'não']),
  ])

  return (
    <div className="stack">
      <PageHead title="Lançamentos a crédito" sub={data ? `${sales.length} lançamentos · ${mt(total)}` : ''}>
        <Btn variant="secondary" icon="download" onClick={exportar} disabled={!sales.length}>Exportar CSV</Btn>
        <Btn icon="plus" onClick={() => setModal('novo')} disabled={!data}>Novo lançamento</Btn>
      </PageHead>

      <div className="panel panel-body row" style={{ alignItems: 'flex-end' }}>
        <Field label="De"><Input type="date" value={f.de} onChange={set('de')} /></Field>
        <Field label="Até"><Input type="date" value={f.ate} onChange={set('ate')} /></Field>
        <Field label="Cliente"><Select value={f.cliente} onChange={set('cliente')}><option value="">Todos</option>{(data?.clients || []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</Select></Field>
        <Field label="Produto"><Select value={f.produto} onChange={set('produto')}><option value="">Todos</option>{(data?.products || []).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</Select></Field>
        <Field label="Requisição / matrícula"><Input value={f.busca} onChange={set('busca')} placeholder="Procurar" /></Field>
        <label className="check" style={{ minHeight: 42 }}><input type="checkbox" checked={f.semFoto} onChange={e => setF(x => ({ ...x, semFoto: e.target.checked }))} />Só sem foto</label>
      </div>

      {Object.keys(porProduto).length > 0 && (
        <div className="row">{Object.entries(porProduto).map(([pid, qn]) => (
          <Tag key={pid}><span className="dot" style={{ background: prod[pid]?.cor }} />{prod[pid]?.nome}: {n2(qn)} {prod[pid]?.unidade}</Tag>
        ))}</div>
      )}

      <ErrorNote error={error} onRetry={reload} />
      <div className="panel">
        {loading && !data ? <Loading /> : sales.length === 0 ? <Empty title="Sem lançamentos neste período" /> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Data</th><th>Cliente</th><th>Foto</th><th>Req.</th><th>Matrícula</th><th>Produto</th><th className="right">Qtd</th><th className="right">Preço</th><th className="right">Total</th><th>Origem</th><th /></tr></thead>
              <tbody>{sales.map(s => (
                <tr key={s.id}>
                  <td className="num">{dt(s.data)}</td>
                  <td><a href={`#/clientes/${s.client_id}`}>{cli[s.client_id]?.nome}</a></td>
                  <td>{s.foto_path ? <PhotoButton path={s.foto_path} /> : <AddPhotoButton saleId={s.id} onDone={reload} label="" />}</td>
                  <td>{s.requisicao || '—'}</td>
                  <td>{s.matricula || '—'}</td>
                  <td>{prod[s.product_id]?.nome}</td>
                  <td className="right num">{n2(s.quantidade)}</td>
                  <td className="right num">{n2(s.preco_unit)}</td>
                  <td className="right num"><b>{mt(s.total)}</b></td>
                  <td>{s.shift_id ? <a href={`#/turnos/${s.shift_id}`}>Turno #{s.shift_id}</a> : <span className="muted">Escritório</span>} {s.invoice_id && <Tag kind="fechado">Faturado</Tag>}</td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}>
                    <button className="x" aria-label="Editar" onClick={() => setModal({ venda: s })}>✎</button>
                    {!s.invoice_id && <button className="x" aria-label="Apagar" onClick={() => apagar(s)}>✕</button>}
                  </td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td colSpan={8}>Total</td><td className="right num">{mt(total)}</td><td colSpan={2} /></tr></tfoot>
            </table>
          </div>
        )}
      </div>
      {modal === 'novo' && <CreditSaleForm clients={data.clients} products={data.products} onClose={() => setModal(null)} onSaved={reload} />}
      {modal?.venda && <CreditSaleForm sale={modal.venda} clients={data.clients} products={data.products} onClose={() => setModal(null)} onSaved={reload} />}
    </div>
  )
}
