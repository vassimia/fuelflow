import { useEffect, useState } from 'react'
import { supabase, q } from '../lib/supabase.js'
import { today, monthStart, monthEnd, parseNum, mt, METODOS_PAG } from '../lib/format.js'
import { FormModal, Field, Input, Select, Textarea } from '../components/ui.jsx'

const useForm = (init) => {
  const [f, setF] = useState(init)
  const set = (k) => (e) => {
    const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e
    setF(x => ({ ...x, [k]: v }))
  }
  return [f, set, setF]
}

// ---------------------------------------------------------------- Cliente
export function ClientForm({ client, onClose, onSaved }) {
  const [f, set] = useForm({
    nome: client?.nome || '', nuit: client?.nuit || '', contacto: client?.contacto || '', email: client?.email || '',
    endereco: client?.endereco || '', limite_credito: client?.limite_credito ?? '', notas: client?.notas || '', activo: client?.activo ?? true,
  })
  async function save() {
    const row = { ...f, nome: f.nome.trim(), limite_credito: parseNum(f.limite_credito) || 0 }
    if (client) await q(supabase.from('clients').update(row).eq('id', client.id))
    else await q(supabase.from('clients').insert(row))
    onSaved?.()
    return client ? 'Cliente actualizado' : 'Cliente criado'
  }
  return (
    <FormModal title={client ? 'Editar cliente' : 'Novo cliente'} onClose={onClose} onSubmit={save} submitLabel={client ? 'Guardar' : 'Criar cliente'}>
      <Field label="Nome da empresa / cliente"><Input required value={f.nome} onChange={set('nome')} autoFocus /></Field>
      <div className="grid2">
        <Field label="NUIT"><Input value={f.nuit} onChange={set('nuit')} inputMode="numeric" /></Field>
        <Field label="Contacto"><Input value={f.contacto} onChange={set('contacto')} inputMode="tel" /></Field>
      </div>
      <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
      <Field label="Morada"><Input value={f.endereco} onChange={set('endereco')} /></Field>
      <Field label="Limite de crédito (MT)" hint="Deixa vazio ou 0 para não ter limite. O operador é avisado quando o cliente passa o limite.">
        <Input value={f.limite_credito} onChange={set('limite_credito')} inputMode="decimal" />
      </Field>
      <Field label="Notas"><Textarea value={f.notas} onChange={set('notas')} /></Field>
      {client && <label className="check"><input type="checkbox" checked={f.activo} onChange={set('activo')} />Cliente activo (aparece para os operadores)</label>}
    </FormModal>
  )
}

// ---------------------------------------------------------------- Lançamento a crédito (admin)
export function CreditSaleForm({ sale, clients, products, clientId, onClose, onSaved }) {
  const [f, set, setF] = useForm({
    client_id: sale?.client_id || clientId || '', data: sale?.data || today(), product_id: sale?.product_id || '',
    quantidade: sale?.quantidade ?? '', preco_unit: sale?.preco_unit ?? '', requisicao: sale?.requisicao || '',
    matricula: sale?.matricula || '', motorista: sale?.motorista || '', notas: sale?.notas || '',
  })
  useEffect(() => {
    if (!sale && f.product_id) {
      const p = products.find(x => x.id === Number(f.product_id))
      if (p) setF(x => ({ ...x, preco_unit: p.preco }))
    }
  }, [f.product_id]) // eslint-disable-line
  const total = (parseNum(f.quantidade) || 0) * (parseNum(f.preco_unit) || 0)
  async function save() {
    const qtd = parseNum(f.quantidade), preco = parseNum(f.preco_unit)
    if (!qtd || qtd <= 0) throw new Error('Indica a quantidade.')
    if (preco == null) throw new Error('Indica o preço.')
    const row = {
      client_id: Number(f.client_id), data: f.data, product_id: Number(f.product_id), quantidade: qtd, preco_unit: preco,
      requisicao: f.requisicao.trim() || null, matricula: f.matricula.trim().toUpperCase() || null,
      motorista: f.motorista.trim() || null, notas: f.notas.trim() || null,
    }
    if (sale) await q(supabase.from('credit_sales').update(row).eq('id', sale.id))
    else await q(supabase.from('credit_sales').insert(row))
    onSaved?.()
    return sale ? 'Lançamento actualizado' : 'Lançamento registado'
  }
  return (
    <FormModal title={sale ? 'Editar lançamento' : 'Novo lançamento a crédito'} onClose={onClose} onSubmit={save} submitLabel={sale ? 'Guardar' : 'Registar lançamento'}>
      <Field label="Cliente">
        <Select required value={f.client_id} onChange={set('client_id')}>
          <option value="">Escolher cliente…</option>
          {clients.filter(c => c.activo || c.id === Number(f.client_id)).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
      </Field>
      <div className="grid2">
        <Field label="Data"><Input type="date" required value={f.data} onChange={set('data')} /></Field>
        <Field label="Nº requisição"><Input value={f.requisicao} onChange={set('requisicao')} /></Field>
      </div>
      <Field label="Produto">
        <Select required value={f.product_id} onChange={set('product_id')}>
          <option value="">Escolher produto…</option>
          {products.filter(p => p.activo || p.id === Number(f.product_id)).map(p => <option key={p.id} value={p.id}>{p.nome} — {mt(p.preco)}/{p.unidade}</option>)}
        </Select>
      </Field>
      <div className="grid2">
        <Field label="Quantidade"><Input required value={f.quantidade} onChange={set('quantidade')} inputMode="decimal" /></Field>
        <Field label="Preço unitário (MT)" hint="Por defeito, o preço actual do produto"><Input required value={f.preco_unit} onChange={set('preco_unit')} inputMode="decimal" /></Field>
      </div>
      <div className="grid2">
        <Field label="Matrícula"><Input value={f.matricula} onChange={set('matricula')} /></Field>
        <Field label="Motorista"><Input value={f.motorista} onChange={set('motorista')} /></Field>
      </div>
      <Field label="Notas"><Input value={f.notas} onChange={set('notas')} /></Field>
      <div className="kv total"><span>Total</span><span className="num">{mt(total)}</span></div>
      {sale?.invoice_id && <div className="note warn">Este lançamento já está numa fatura. Se mudares o valor, anula e volta a emitir a fatura.</div>}
    </FormModal>
  )
}

// ---------------------------------------------------------------- Pagamento
export function PaymentForm({ clients, clientId, saldo, onClose, onSaved }) {
  const [f, set] = useForm({ client_id: clientId || '', data: today(), valor: '', metodo: 'transferencia', referencia: '', notas: '' })
  async function save() {
    const valor = parseNum(f.valor)
    if (!valor || valor <= 0) throw new Error('Indica o valor pago.')
    await q(supabase.from('payments').insert({
      client_id: Number(f.client_id), data: f.data, valor, metodo: f.metodo,
      referencia: f.referencia.trim() || null, notas: f.notas.trim() || null,
    }))
    onSaved?.()
    return 'Pagamento registado'
  }
  return (
    <FormModal title="Registar pagamento" onClose={onClose} onSubmit={save} submitLabel="Registar pagamento">
      <Field label="Cliente">
        <Select required value={f.client_id} onChange={set('client_id')} disabled={!!clientId}>
          <option value="">Escolher cliente…</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
      </Field>
      {saldo != null && <div className="note">Saldo em dívida: <b className="num">{mt(saldo)}</b></div>}
      <div className="grid2">
        <Field label="Data"><Input type="date" required value={f.data} onChange={set('data')} /></Field>
        <Field label="Valor (MT)"><Input required value={f.valor} onChange={set('valor')} inputMode="decimal" autoFocus /></Field>
      </div>
      <div className="grid2">
        <Field label="Forma de pagamento">
          <Select value={f.metodo} onChange={set('metodo')}>{Object.entries(METODOS_PAG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Field>
        <Field label="Referência" hint="Nº da transferência, cheque, recibo…"><Input value={f.referencia} onChange={set('referencia')} /></Field>
      </div>
      <Field label="Notas"><Input value={f.notas} onChange={set('notas')} /></Field>
    </FormModal>
  )
}

// ---------------------------------------------------------------- Fatura
export function InvoiceForm({ clients, clientId, onClose, onSaved }) {
  const prev = new Date(); prev.setMonth(prev.getMonth() - 1)
  const [f, set] = useForm({ client_id: clientId || '', inicio: monthStart(prev), fim: monthEnd(prev), notas: '' })
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    setPreview(null)
    if (!f.client_id || !f.inicio || !f.fim) return
    let alive = true
    q(supabase.from('credit_sales').select('total').eq('client_id', Number(f.client_id)).is('invoice_id', null).gte('data', f.inicio).lte('data', f.fim))
      .then(rows => alive && setPreview({ n: rows.length, total: rows.reduce((a, r) => a + Number(r.total), 0) }))
      .catch(() => {})
    return () => { alive = false }
  }, [f.client_id, f.inicio, f.fim])
  async function save() {
    const id = await q(supabase.rpc('create_invoice', { p_client_id: Number(f.client_id), p_inicio: f.inicio, p_fim: f.fim, p_notas: f.notas.trim() || null }))
    onSaved?.(id)
    return 'Fatura emitida'
  }
  return (
    <FormModal title="Emitir fatura" onClose={onClose} onSubmit={save} submitLabel="Emitir fatura">
      <Field label="Cliente">
        <Select required value={f.client_id} onChange={set('client_id')} disabled={!!clientId}>
          <option value="">Escolher cliente…</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
      </Field>
      <div className="grid2">
        <Field label="Período: de"><Input type="date" required value={f.inicio} onChange={set('inicio')} /></Field>
        <Field label="até"><Input type="date" required value={f.fim} onChange={set('fim')} /></Field>
      </div>
      <Field label="Notas na fatura"><Input value={f.notas} onChange={set('notas')} /></Field>
      {preview && (preview.n === 0
        ? <div className="note warn">Não há lançamentos por faturar neste período.</div>
        : <div className="note">{preview.n} lançamentos por faturar, total <b className="num">{mt(preview.total)}</b>.</div>)}
      <p className="muted" style={{ fontSize: 13 }}>Só entram lançamentos que ainda não estão noutra fatura. O número é atribuído automaticamente (FT {new Date().getFullYear()}/…).</p>
    </FormModal>
  )
}

