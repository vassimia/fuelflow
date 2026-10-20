import { useEffect, useState } from 'react'
import { supabase, configured, q } from './lib/supabase.js'
import Login from './Login.jsx'
import AdminApp from './admin/AdminApp.jsx'
import OperatorApp from './operator/OperatorApp.jsx'
import { Btn, Loading } from './components/ui.jsx'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [mode, setMode] = useState(() => localStorage.getItem('ff-mode') || 'admin')

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    let alive = true
    const load = async (tries = 0) => {
      try {
        const p = await q(supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle())
        if (!p && tries < 5) return setTimeout(() => load(tries + 1), 600)
        if (alive) setProfile(p || { missing: true })
      } catch { if (alive) setProfile({ missing: true }) }
    }
    load()
    return () => { alive = false }
  }, [session?.user?.id])

  const switchMode = (m) => { setMode(m); try { localStorage.setItem('ff-mode', m) } catch {} }
  const logout = () => supabase.auth.signOut()

  if (!configured) return <Setup />
  if (session === undefined) return <Loading />
  if (!session) return <Login />
  if (!profile) return <Loading />

  if (profile.missing || !profile.activo) {
    return (
      <div className="login-form" style={{ minHeight: '100%' }}>
        <div className="stack" style={{ maxWidth: 380 }}>
          <h1>Conta à espera de activação</h1>
          <p className="muted">O administrador tem de activar a tua conta em Configuração → Utilizadores antes de poderes usar o FuelFlow.</p>
          <Btn variant="secondary" onClick={logout}>Sair</Btn>
        </div>
      </div>
    )
  }

  if (profile.role === 'admin' && mode === 'admin') {
    return <AdminApp profile={profile} onLogout={logout} onOperatorMode={() => switchMode('operador')} />
  }
  return <OperatorApp profile={profile} onLogout={logout}
    onAdminMode={profile.role === 'admin' ? () => switchMode('admin') : null} />
}

function Setup() {
  return (
    <div className="login-form" style={{ minHeight: '100%' }}>
      <div className="stack" style={{ maxWidth: 520 }}>
        <h1>Falta ligar à base de dados</h1>
        <p>Define estas duas variáveis no Vercel (Settings → Environment Variables) ou num ficheiro <code>.env</code>:</p>
        <pre className="panel panel-body" style={{ margin: 0, overflowX: 'auto' }}>VITE_SUPABASE_URL=https://xxxx.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=…</pre>
        <p className="muted">Depois volta a fazer o deploy. O guia completo está no ficheiro GUIA.md do projecto.</p>
      </div>
    </div>
  )
}
