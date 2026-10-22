import { lt, n0 } from '../lib/format.js'

export default function TankBar({ tank, product }) {
  const cap = Number(tank.capacidade) || 0
  const lvl = Number(tank.nivel_actual) || 0
  const pct = cap > 0 ? Math.max(0, Math.min(100, (lvl / cap) * 100)) : 0
  const low = lvl <= Number(tank.nivel_minimo || 0)
  return (
    <div className="tank">
      <div className="row" style={{ gap: 8 }}>
        <span className="dot" style={{ background: product?.cor || 'var(--muted)' }} />
        <b>{tank.nome}</b>
        <span className="muted">{product?.nome}</span>
        {tank.estado === 'activo' && <span className="tag validado">a trabalhar</span>}
      </div>
      <div className={`num ${low ? 'neg' : ''}`}><b>{lt(lvl)}</b>{cap > 0 && <span className="muted"> de {n0(cap)} L</span>}</div>
      <div className="tank-bar" role="meter" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={lvl} aria-label={`Nível ${tank.nome}`}>
        <i style={{ width: pct + '%', background: low ? 'var(--red)' : (product?.cor || 'var(--blue)') }} />
      </div>
    </div>
  )
}
