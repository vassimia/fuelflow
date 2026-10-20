import { useState } from 'react'
import { useHash } from '../lib/hooks.js'
import { Icon } from '../components/ui.jsx'
import Dashboard from './Dashboard.jsx'
import Shifts from './Shifts.jsx'
import ShiftDetail from './ShiftDetail.jsx'
import Clients from './Clients.jsx'
import ClientDetail from './ClientDetail.jsx'
import CreditSales from './CreditSales.jsx'
import Payments from './Payments.jsx'
import Invoices from './Invoices.jsx'
import Stock from './Stock.jsx'
import Reports from './Reports.jsx'
import Settings from './Settings.jsx'

const NAV = [
  { group: 'Bomba' },
  { to: '', label: 'Painel', icon: 'dashboard' },
  { to: 'turnos', label: 'Turnos', icon: 'shift' },
  { to: 'stock', label: 'Tanques e stock', icon: 'tank' },
  { group: 'Crédito' },
  { to: 'clientes', label: 'Clientes', icon: 'clients' },
  { to: 'lancamentos', label: 'Lançamentos', icon: 'credit' },
  { to: 'pagamentos', label: 'Pagamentos', icon: 'payment' },
  { to: 'faturas', label: 'Faturas', icon: 'invoice' },
  { group: 'Gestão' },
  { to: 'relatorios', label: 'Relatórios', icon: 'report' },
  { to: 'config', label: 'Configuração', icon: 'settings' },
]

export default function AdminApp({ profile, onLogout, onOperatorMode }) {
  const [hash, go] = useHash()
  const [open, setOpen] = useState(false)
  const [section, id] = hash.split('/')

  let page
  switch (section) {
    case 'turnos': page = id ? <ShiftDetail id={Number(id)} go={go} /> : <Shifts go={go} />; break
    case 'clientes': page = id ? <ClientDetail id={Number(id)} go={go} /> : <Clients go={go} />; break
    case 'lancamentos': page = <CreditSales go={go} />; break
    case 'pagamentos': page = <Payments go={go} />; break
    case 'faturas': page = <Invoices go={go} />; break
    case 'stock': page = <Stock />; break
    case 'relatorios': page = <Reports />; break
    case 'config': page = <Settings profile={profile} tab={id} go={go} />; break
    default: page = <Dashboard go={go} />
  }

  const nav = (to) => { go(to); setOpen(false); window.scrollTo(0, 0) }

  return (
    <div className="shell">
      <div className="topbar">
        <button onClick={() => setOpen(true)} aria-label="Abrir menu"><Icon name="menu" size={22} /></button>
        <b style={{ fontFamily: 'var(--font-cond)', fontSize: 18 }}>FuelFlow</b>
      </div>
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><i /></div>
          <div><b>FuelFlow</b><small>Estação Quelimane</small></div>
        </div>
        {NAV.map((n, i) => n.group
          ? <div key={i} className="nav-group">{n.group}</div>
          : <button key={i} className={`nav-item ${section === n.to || (!section && !n.to) ? 'on' : ''}`} onClick={() => nav(n.to)}>
              <Icon name={n.icon} />{n.label}
            </button>)}
        <div className="side-foot stack" style={{ gap: 6 }}>
          <div><b style={{ color: '#fff' }}>{profile.nome}</b><div style={{ color: '#93A1AF' }}>Administrador</div></div>
          <button className="nav-item" onClick={onOperatorMode}><Icon name="pump" />Abrir modo operador</button>
          <button className="nav-item" onClick={onLogout}><Icon name="logout" />Sair</button>
        </div>
      </aside>
      <main className="main">{page}</main>
    </div>
  )
}
