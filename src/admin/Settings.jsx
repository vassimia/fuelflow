import { useState } from 'react'
import { supabase, signupClient, q, traduzErro } from '../lib/supabase.js'
import { useData } from '../lib/hooks.js'
import { getProducts, getTanks, getHoses, getProfiles, getSettings, getSides, byId } from '../lib/refs.js'
import { mt, n2, dtt, parseNum, TIPOS_PRODUTO } from '../lib/format.js'
import { PageHead, Loading, ErrorNote, Empty, Btn, Field, Input, Select, Textarea, FormModal, Tag, Meter, useAction, confirmar } from '../components/ui.jsx'

const TABS = [['empresa', 'Empresa'], ['produtos', 'Produtos e preços'], ['mangueiras', 'Bombas e mangueiras'], ['utilizadores', 'Utilizadores'], ['conta', 'A minha conta']]

export default function Settings({ profile, tab = 'empresa', go }) {
  const current = TABS.some(([k]) => k === tab) ? tab : 'empresa'
  return (
    <div className="stack">
      <PageHead title="Configuração" />
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={`tab ${current === k ? 'on' : ''}`} onClick={() => go('config/' + k)}>{l}</button>)}</div>
      {current === 'empresa' && <Company />}
      {current === 'produtos' && <Products />}
      {current === 'mangueiras' && <Hoses />}
      {current === 'utilizadores' && <Users profile={profile} />}
      {current === 'conta' && <MyAccount profile={profile} />}
    </div>
  )
}

// ---------------------------------------------------------------- Empresa
function Company() {
  const act = useAction()
  const { data, loading, error, reload } = useData(getSettings)
  const [f, setF] = useState(null)
  if (loading && !data) return <Loading />
  if (error) return <ErrorNote error={error} onRetry={reload} />
  const v = f || data || {}
  const set = (k) => (e) => setF({ ...v, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault()
    const { empresa, nuit, endereco, contacto, email, dados_bancarios, rodape } = v
    if (await act(() => q(supabase.from('app_settings').update({ empresa, nuit, endereco, contacto, email, dados_bancarios, rodape, updated_at: new Date().toISOString() }).eq('id', 1)), 'Dados da empresa guardados')) { setF(null); reload() }
  }
  return (
    <form className="panel panel-body stack" style={{ maxWidth: 640 }} onSubmit={save}>
      <p className="muted">Aparecem no cabeçalho das faturas e extratos.</p>
      <Field label="Nome da empresa"><Input value={v.empresa || ''} onChange={set('empresa')} /></Field>
      <div className="grid2">
        <Field label="NUIT"><Input value={v.nuit || ''} onChange={set('nuit')} /></Field>
        <Field label="Contacto"><Input value={v.contacto || ''} onChange={set('contacto')} /></Field>
      </div>
      <Field label="Morada"><Input value={v.endereco || ''} onChange={set('endereco')} /></Field>
      <Field label="Email"><Input value={v.email || ''} onChange={set('email')} /></Field>
      <Field label="Dados bancários para pagamento" hint="Uma conta por linha (banco, nº de conta, NIB)"><Textarea value={v.dados_bancarios || ''} onChange={set('dados_bancarios')} /></Field>
      <Field label="Rodapé das faturas"><Input value={v.rodape || ''} onChange={set('rodape')} /></Field>
      <div><button className="btn" disabled={!f}>Guardar</button></div>
    </form>
  )
}

// ---------------------------------------------------------------- Produtos
function Products() {
  const [modal, setModal] = useState(null)
  const { data, loading, error, reload } = useData(async () => {
    const [products, history] = await Promise.all([getProducts(), q(supabase.from('price_history').select('*').order('alterado_em', { ascending: false }).limit(50))])
    return { products, history }
  })
  if (loading && !data) return <Loading />
  if (error) return <ErrorNote error={error} onRetry={reload} />
  const prod = byId(data.products)
  return (
    <div className="stack">
      <div className="row"><p className="muted">Mudar o preço afecta os turnos abertos a partir de agora. Os turnos já abertos mantêm o preço da abertura.</p><div className="spacer" />
        <Btn icon="plus" onClick={() => setModal({ p: null })}>Novo produto</Btn></div>
      <section className="panel"><div className="table-wrap"><table className="t">
        <thead><tr><th>Produto</th><th>Tipo</th><th>Unidade</th><th className="right">Preço</th><th>Estado</th><th /></tr></thead>
        <tbody>{data.products.map(p => (
          <tr key={p.id}>
            <td><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: p.cor }} /><b>{p.nome}</b></span></td>
            <td>{TIPOS_PRODUTO[p.tipo]}</td><td>{p.unidade}</td>
            <td className="right num"><b>{mt(p.preco)}</b></td>
            <td>{p.activo ? <Tag kind="validado">Activo</Tag> : <Tag>Inactivo</Tag>}</td>
            <td className="right"><Btn small variant="ghost" icon="edit" onClick={() => setModal({ p })}>Editar</Btn></td>
          </tr>
        ))}</tbody>
      </table></div></section>
      <section className="panel">
        <div className="panel-head"><h2>Histórico de preços</h2></div>
        {data.history.length === 0 ? <Empty title="Sem alterações" /> : (
          <table className="t"><tbody>{data.history.map(h => (
            <tr key={h.id}><td className="num">{dtt(h.alterado_em)}</td><td>{prod[h.product_id]?.nome}</td>
              <td className="right num">{h.preco_anterior == null ? 'novo' : n2(h.preco_anterior)} → <b>{n2(h.preco_novo)}</b></td></tr>
          ))}</tbody></table>
        )}
      </section>
      {modal && <ProductForm product={modal.p} onClose={() => setModal(null)} onSaved={reload} />}
    </div>
  )
}

function ProductForm({ product, onClose, onSaved }) {
  const [f, setF] = useState({ nome: product?.nome || '', tipo: product?.tipo || 'combustivel', unidade: product?.unidade || 'L', preco: product?.preco ?? '', cor: product?.cor || '#1F4E8C', activo: product?.activo ?? true, ordem: product?.ordem ?? 10 })
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  async function save() {
    const preco = parseNum(f.preco)
    if (preco == null || preco < 0) throw new Error('Indica um preço válido.')
    const row = { nome: f.nome.trim(), tipo: f.tipo, unidade: f.unidade.trim() || 'L', preco, cor: f.cor, activo: f.activo, ordem: Number(f.ordem) || 0 }
    if (product) await q(supabase.from('products').update(row).eq('id', product.id))
    else await q(supabase.from('products').insert(row))
    onSaved()
    return product ? 'Produto actualizado' : 'Produto criado'
  }
  return (
    <FormModal title={product ? `Editar ${product.nome}` : 'Novo produto'} onClose={onClose} onSubmit={save}>
      <Field label="Nome"><Input required value={f.nome} onChange={set('nome')} /></Field>
      <div className="grid2">
        <Field label="Tipo"><Select value={f.tipo} onChange={set('tipo')}>{Object.entries(TIPOS_PRODUTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Unidade" hint="L, un, balde, lata…"><Input value={f.unidade} onChange={set('unidade')} /></Field>
      </div>
      <div className="grid2">
        <Field label="Preço de venda com IVA (MT)"><Input required value={f.preco} onChange={set('preco')} inputMode="decimal" /></Field>
        <Field label="Cor"><Input type="color" value={f.cor} onChange={set('cor')} style={{ padding: 4 }} /></Field>
      </div>
      <Field label="Ordem na lista"><Input type="number" value={f.ordem} onChange={set('ordem')} /></Field>
      {product && <label className="check"><input type="checkbox" checked={f.activo} onChange={set('activo')} />Produto activo</label>}
    </FormModal>
  )
}

// ---------------------------------------------------------------- Mangueiras
function Hoses() {
  const [modal, setModal] = useState(null)
  const { data, loading, error, reload } = useData(async () => {
    const [hoses, products, tanks, sides, open] = await Promise.all([getHoses(), getProducts(), getTanks(), getSides(),
      q(supabase.from('shift_readings').select('hose_id, shifts!inner(estado)').eq('shifts.estado', 'aberto'))])
    return { hoses, products, tanks, sides, busy: new Set(open.map(r => r.hose_id)) }
  })
  if (loading && !data) return <Loading />
  if (error) return <ErrorNote error={error} onRetry={reload} />
  const prod = byId(data.products)
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row"><p className="muted">Cada lado tem o seu fecho de turno. O contador de cada mangueira é a leitura com que o próximo turno desse lado começa.</p><div className="spacer" />
        <Btn icon="plus" onClick={() => setModal({ h: null })} disabled={!data.products.length}>Nova mangueira</Btn></div>
      {data.sides.map(side => {
        const hs = data.hoses.filter(h => h.side_id === side.id)
        const emTurno = hs.some(h => data.busy.has(h.id))
        return (
          <section key={side.id} className="panel">
            <div className="panel-head">
              <h2>{side.nome}</h2><span className="muted">{[...new Set(hs.map(h => h.bomba))].length} bombas · {hs.length} mangueiras</span>
              <div className="spacer" />
              {emTurno && <Tag kind="aberto">Turno aberto</Tag>}
              <Btn small variant="secondary" onClick={() => setModal({ contadores: side })} disabled={!hs.length || emTurno}>Acertar contadores</Btn>
            </div>
            {hs.length === 0 ? <Empty title="Sem mangueiras neste lado" /> : (
              <div className="table-wrap"><table className="t">
                <thead><tr><th>Bomba</th><th>Mangueira</th><th>Produto</th><th>Tanque a trabalhar</th><th>Contador actual</th><th>Estado</th><th /></tr></thead>
                <tbody>{hs.map(h => (
                  <tr key={h.id}>
                    <td>{h.bomba}</td><td><b>{h.codigo}</b></td>
                    <td><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: prod[h.product_id]?.cor }} />{prod[h.product_id]?.nome}</span></td>
                    <td>{data.tanks.find(t => t.side_id === h.side_id && t.product_id === h.product_id && t.estado === 'activo')?.nome || <span className="neg">nenhum tanque ligado</span>}</td>
                    <td><Meter value={h.leitura_actual} size="sm" /></td>
                    <td>{data.busy.has(h.id) ? <Tag kind="aberto">Em turno</Tag> : h.activo ? <Tag kind="validado">Activa</Tag> : <Tag>Inactiva</Tag>}</td>
                    <td className="right"><Btn small variant="ghost" icon="edit" onClick={() => setModal({ h })}>Editar</Btn></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        )
      })}
      {modal?.h !== undefined && <HoseForm hose={modal.h} busy={modal.h && data.busy.has(modal.h.id)} products={data.products} tanks={data.tanks} sides={data.sides} onClose={() => setModal(null)} onSaved={reload} />}
      {modal?.contadores && <CountersForm side={modal.contadores} hoses={data.hoses.filter(h => h.side_id === modal.contadores.id)} products={prod} onClose={() => setModal(null)} onSaved={reload} />}
    </div>
  )
}

function CountersForm({ side, hoses, products, onClose, onSaved }) {
  const [vals, setVals] = useState(() => Object.fromEntries(hoses.map(h => [h.id, String(h.leitura_actual)])))
  async function save() {
    const items = []
    for (const h of hoses) {
      const v = parseNum(vals[h.id])
      if (v == null || v < 0) throw new Error(`Contador inválido em ${h.codigo}.`)
      if (v !== Number(h.leitura_actual)) items.push({ id: h.id, leitura: v })
    }
    if (!items.length) return 'Nada mudou'
    await q(supabase.rpc('set_hose_counters', { p_items: items }))
    onSaved()
    return `${items.length} contador${items.length > 1 ? 'es' : ''} actualizado${items.length > 1 ? 's' : ''}`
  }
  const bombas = [...new Set(hoses.map(h => h.bomba))]
  return (
    <FormModal title={`Acertar contadores — ${side.nome}`} onClose={onClose} onSubmit={save} submitLabel="Guardar contadores">
      <p className="muted">Escreve o número que cada contador mostra agora. O próximo turno deste lado começa com estes valores.</p>
      {bombas.map(b => (
        <div key={b} className="stack" style={{ gap: 8 }}>
          <h3>{b}</h3>
          <div className="grid2">
            {hoses.filter(h => h.bomba === b).map(h => (
              <Field key={h.id} label={`${h.codigo} — ${products[h.product_id]?.nome || ''}`}>
                <Input value={vals[h.id]} onChange={e => setVals(v => ({ ...v, [h.id]: e.target.value }))} inputMode="decimal" />
              </Field>
            ))}
          </div>
        </div>
      ))}
    </FormModal>
  )
}

function HoseForm({ hose, busy, products, tanks, sides, onClose, onSaved }) {
  const [f, setF] = useState({ side_id: hose?.side_id || '', codigo: hose?.codigo || '', bomba: hose?.bomba || '', product_id: hose?.product_id || '', tank_id: hose?.tank_id || '', leitura_actual: hose?.leitura_actual ?? '', activo: hose?.activo ?? true, ordem: hose?.ordem ?? 0 })
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const changedMeter = hose && parseNum(f.leitura_actual) !== Number(hose.leitura_actual)
  async function save() {
    const leitura = parseNum(f.leitura_actual)
    if (leitura == null || leitura < 0) throw new Error('Indica o contador actual da mangueira.')
    if (busy && (changedMeter || String(f.side_id) !== String(hose.side_id))) throw new Error('Esta mangueira está num turno aberto. Fecha o turno antes de mudar o contador ou o lado.')
    const row = { side_id: Number(f.side_id), codigo: f.codigo.trim(), bomba: f.bomba.trim(), product_id: Number(f.product_id), activo: f.activo, ordem: Number(f.ordem) || 0 }
    if (hose) {
      await q(supabase.from('hoses').update(row).eq('id', hose.id))
      if (changedMeter) await q(supabase.rpc('set_hose_counters', { p_items: [{ id: hose.id, leitura }] }))
    } else await q(supabase.from('hoses').insert({ ...row, leitura_actual: leitura }))
    onSaved()
    return hose ? 'Mangueira actualizada' : 'Mangueira registada'
  }
  const fuel = products.filter(p => p.tipo === 'combustivel')
  return (
    <FormModal title={hose ? `Editar ${hose.codigo}` : 'Nova mangueira'} onClose={onClose} onSubmit={save}>
      <Field label="Lado"><Select required value={f.side_id} onChange={set('side_id')}><option value="">Escolher…</option>{sides.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</Select></Field>
      <div className="grid2">
        <Field label="Bomba" hint="ex.: BOMBA 1"><Input required value={f.bomba} onChange={set('bomba')} /></Field>
        <Field label="Código" hint="ex.: B1 - D"><Input required value={f.codigo} onChange={set('codigo')} /></Field>
      </div>
      <Field label="Produto"><Select required value={f.product_id} onChange={set('product_id')}><option value="">Escolher…</option>{fuel.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</Select></Field>
      <p className="muted" style={{ fontSize: 13 }}>A mangueira tira sempre do tanque que está a trabalhar no seu lado para este produto.</p>
      <Field label="Contador actual" hint={hose ? 'Só muda isto se o contador foi trocado ou reiniciado.' : 'O número que o contador da bomba mostra agora.'}>
        <Input required value={f.leitura_actual} onChange={set('leitura_actual')} inputMode="decimal" disabled={busy} />
      </Field>
      {changedMeter && <div className="note warn">O próximo turno vai começar com este contador em vez de {n2(hose.leitura_actual)}.</div>}
      <Field label="Ordem" hint="Ordem em que aparece no fecho"><Input type="number" value={f.ordem} onChange={set('ordem')} /></Field>
      {hose && <label className="check"><input type="checkbox" checked={f.activo} onChange={set('activo')} />Mangueira em uso</label>}
    </FormModal>
  )
}

// ---------------------------------------------------------------- Utilizadores
function Users({ profile }) {
  const act = useAction()
  const [modal, setModal] = useState(null)
  const { data, loading, error, reload } = useData(getProfiles)
  if (loading && !data) return <Loading />
  if (error) return <ErrorNote error={error} onRetry={reload} />
  const upd = (p, row, msg) => act(() => q(supabase.from('profiles').update(row).eq('id', p.id)), msg).then(ok => ok && reload())
  return (
    <div className="stack">
      <div className="row"><p className="muted">Os operadores entram com o nome de utilizador e a senha que definires aqui.</p><div className="spacer" />
        <Btn icon="plus" onClick={() => setModal('novo')}>Novo operador</Btn></div>
      <section className="panel"><div className="table-wrap"><table className="t">
        <thead><tr><th>Nome</th><th>Utilizador</th><th>Função</th><th>Estado</th><th /></tr></thead>
        <tbody>{data.map(p => {
          const me = p.id === profile.id
          return (
            <tr key={p.id}>
              <td><b>{p.nome}</b>{me && <span className="muted"> (tu)</span>}<div className="muted" style={{ fontSize: 12 }}>{p.email}</div></td>
              <td className="num">{p.username}</td>
              <td>{p.role === 'admin' ? 'Administrador' : 'Operador'}</td>
              <td>{p.activo ? <Tag kind="validado">Activo</Tag> : <Tag kind="red">Inactivo</Tag>}</td>
              <td className="right" style={{ whiteSpace: 'nowrap' }}>
                <Btn small variant="ghost" onClick={() => setModal({ senha: p })}>Definir senha</Btn>
                {!me && <Btn small variant="ghost" onClick={() => upd(p, { activo: !p.activo }, p.activo ? 'Utilizador desactivado' : 'Utilizador activado')}>{p.activo ? 'Desactivar' : 'Activar'}</Btn>}
                {!me && <Btn small variant="ghost" onClick={() => confirmar(p.role === 'admin' ? `Tirar o acesso de administrador a ${p.nome}?` : `Dar acesso total de administrador a ${p.nome}?`) && upd(p, { role: p.role === 'admin' ? 'operador' : 'admin' }, 'Função alterada')}>{p.role === 'admin' ? 'Tornar operador' : 'Tornar admin'}</Btn>}
              </td>
            </tr>
          )
        })}</tbody>
      </table></div></section>
      {modal === 'novo' && <NewOperator admin={profile} onClose={() => setModal(null)} onSaved={reload} />}
      {modal?.senha && <SetPassword user={modal.senha} onClose={() => setModal(null)} />}
    </div>
  )
}

// Email interno do operador: usa o email do admin com "+utilizador" (ex.: vassim+joao@gmail.com)
function operatorEmail(adminEmail, username) {
  const [local, domain] = (adminEmail || '').split('@')
  if (!local || !domain) return `${username}@fuelflow.app`
  return `${local.split('+')[0]}+${username}@${domain}`
}

function NewOperator({ admin, onClose, onSaved }) {
  const [f, setF] = useState({ nome: '', username: '', password: '' })
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  const username = f.username.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]/g, '')
  async function save() {
    if (username.length < 3) throw new Error('O nome de utilizador deve ter pelo menos 3 letras ou números.')
    if (f.password.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.')
    const exists = await q(supabase.from('profiles').select('id').eq('username', username))
    if (exists.length) throw new Error('Esse nome de utilizador já existe.')
    const { data, error } = await signupClient.auth.signUp({
      email: operatorEmail(admin.email, username), password: f.password,
      options: { data: { nome: f.nome.trim(), username } },
    })
    if (error) throw new Error(traduzErro(error.message))
    const uid = data.user?.id
    if (!uid) throw new Error('Não foi possível criar o utilizador.')
    await q(supabase.from('profiles').update({ activo: true, nome: f.nome.trim() }).eq('id', uid))
    await q(supabase.rpc('admin_confirm_user', { p_user_id: uid }))
    await signupClient.auth.signOut().catch(() => {})
    onSaved()
    return `Operador criado. ${f.nome.trim()} entra com "${username}".`
  }
  return (
    <FormModal title="Novo operador" onClose={onClose} onSubmit={save} submitLabel="Criar operador">
      <Field label="Nome"><Input required value={f.nome} onChange={set('nome')} autoFocus /></Field>
      <Field label="Nome de utilizador" hint={username ? `Entra com: ${username}` : 'Sem espaços nem acentos, ex.: joao'}><Input required value={f.username} onChange={set('username')} autoCapitalize="none" /></Field>
      <Field label="Senha" hint="Pelo menos 6 caracteres. Diz ao operador; podes mudá-la depois."><Input required value={f.password} onChange={set('password')} minLength={6} /></Field>
    </FormModal>
  )
}

function SetPassword({ user, onClose }) {
  const [pw, setPw] = useState('')
  async function save() {
    await q(supabase.rpc('admin_set_password', { p_user_id: user.id, p_password: pw }))
    return `Senha de ${user.nome} alterada`
  }
  return (
    <FormModal title={`Nova senha para ${user.nome}`} onClose={onClose} onSubmit={save} submitLabel="Definir senha">
      <Field label="Nova senha" hint="Pelo menos 6 caracteres"><Input required minLength={6} value={pw} onChange={e => setPw(e.target.value)} autoFocus /></Field>
      <p className="muted">Entra com o utilizador <b>{user.username}</b>.</p>
    </FormModal>
  )
}

// ---------------------------------------------------------------- A minha conta
function MyAccount({ profile }) {
  const act = useAction()
  const [pw, setPw] = useState({ a: '', b: '' })
  const save = async (e) => {
    e.preventDefault()
    if (pw.a !== pw.b) return act(async () => { throw new Error('As senhas não coincidem.') })
    const ok = await act(async () => { const { error } = await supabase.auth.updateUser({ password: pw.a }); if (error) throw new Error(traduzErro(error.message)) }, 'Senha alterada')
    if (ok) setPw({ a: '', b: '' })
  }
  return (
    <form className="panel panel-body stack" style={{ maxWidth: 420 }} onSubmit={save}>
      <div><b>{profile.nome}</b><div className="muted">{profile.email} · utilizador <b>{profile.username}</b></div></div>
      <Field label="Nova senha"><Input type="password" required minLength={6} value={pw.a} onChange={e => setPw(x => ({ ...x, a: e.target.value }))} autoComplete="new-password" /></Field>
      <Field label="Repetir nova senha"><Input type="password" required minLength={6} value={pw.b} onChange={e => setPw(x => ({ ...x, b: e.target.value }))} autoComplete="new-password" /></Field>
      <div><button className="btn">Mudar a minha senha</button></div>
    </form>
  )
}
