import { useEffect, useState } from 'react'
import { supabase, q, traduzErro } from './lib/supabase.js'
import { Field, Input } from './components/ui.jsx'

export default function Login() {
  const [hasUsers, setHasUsers] = useState(null)
  const [form, setForm] = useState({ nome: '', user: '', password: '', password2: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    supabase.rpc('has_users').then(({ data, error }) => setHasUsers(error ? true : !!data))
  }, [])

  async function entrar(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      let email = form.user.trim()
      if (!email.includes('@')) {
        email = await q(supabase.rpc('login_email', { p_username: email }))
        if (!email) throw new Error('Utilizador não encontrado ou inactivo.')
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password: form.password })
      if (error) throw new Error(traduzErro(error.message))
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  async function criarAdmin(e) {
    e.preventDefault(); setErr(null)
    if (form.password !== form.password2) return setErr('As senhas não coincidem.')
    setBusy(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.user.trim(), password: form.password, options: { data: { nome: form.nome.trim() } },
      })
      if (error) throw new Error(traduzErro(error.message))
      if (!data.session) {
        const r = await supabase.auth.signInWithPassword({ email: form.user.trim(), password: form.password })
        if (r.error) throw new Error(traduzErro(r.error.message))
      }
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  const first = hasUsers === false
  return (
    <div className="login">
      <div className="login-art">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark"><i /></div>
          <div><b>FuelFlow</b><small>Gestão da bomba</small></div>
        </div>
        <div>
          <h1>Turnos, crédito e stock num só sítio.</h1>
          <p>Cada turno começa com os contadores do fecho anterior, cada lançamento a crédito fica no extrato do cliente, cada litro sai do tanque certo.</p>
        </div>
        <small style={{ color: '#7D8B99' }}>Estação de Serviço Quelimane</small>
      </div>
      <div className="login-form">
        {hasUsers === null ? <p className="muted">A ligar…</p> : first ? (
          <form className="stack" onSubmit={criarAdmin}>
            <div><h2>Criar conta de administrador</h2><p className="muted" style={{ marginTop: 4 }}>Ainda não há utilizadores. Esta primeira conta fica com acesso total.</p></div>
            <Field label="O teu nome"><Input required value={form.nome} onChange={set('nome')} autoComplete="name" /></Field>
            <Field label="Email"><Input required type="email" value={form.user} onChange={set('user')} autoComplete="email" /></Field>
            <Field label="Senha" hint="Pelo menos 6 caracteres"><Input required type="password" minLength={6} value={form.password} onChange={set('password')} autoComplete="new-password" /></Field>
            <Field label="Repetir senha"><Input required type="password" minLength={6} value={form.password2} onChange={set('password2')} autoComplete="new-password" /></Field>
            {err && <div className="note err">{err}</div>}
            <button className="btn big" disabled={busy}>{busy ? 'A criar…' : 'Criar conta e entrar'}</button>
          </form>
        ) : (
          <form className="stack" onSubmit={entrar}>
            <h2>Entrar</h2>
            <Field label="Email ou nome de utilizador"><Input required value={form.user} onChange={set('user')} autoComplete="username" autoCapitalize="none" /></Field>
            <Field label="Senha"><Input required type="password" value={form.password} onChange={set('password')} autoComplete="current-password" /></Field>
            {err && <div className="note err">{err}</div>}
            <button className="btn big" disabled={busy}>{busy ? 'A entrar…' : 'Entrar'}</button>
            <p className="muted" style={{ fontSize: 13 }}>Esqueceste a senha? Pede ao administrador para definir uma nova.</p>
          </form>
        )}
      </div>
    </div>
  )
}
