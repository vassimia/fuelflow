import { useState } from 'react'
import { supabase, q } from '../lib/supabase.js'
import { useData } from '../lib/hooks.js'
import { getProfiles, byId } from '../lib/refs.js'
import { mt, dtt, duration, addDays, today, downloadCSV , dayStart, dayEnd } from '../lib/format.js'
import { PageHead, Loading, ErrorNote, Empty, Btn, EstadoTag, Field, Input, Select } from '../components/ui.jsx'

export default function Shifts({ go }) {
  const [f, setF] = useState({ de: addDays(today(), -14), ate: today(), estado: '', operador: '' })
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))

  const { data, loading, error, reload } = useData(async () => {
    let qq = supabase.from('shifts').select('*')
      .gte('aberto_em', dayStart(f.de)).lte('aberto_em', dayEnd(f.ate))
      .order('aberto_em', { ascending: false }).limit(500)
    if (f.estado) qq = qq.eq('estado', f.estado)
    if (f.operador) qq = qq.eq('operador_id', f.operador)
    const [shifts, profiles, open] = await Promise.all([
      q(qq), getProfiles(), q(supabase.from('shifts').select('*').eq('estado', 'aberto')),
    ])
    // Turnos abertos aparecem sempre, mesmo fora do período
    const ids = new Set(shifts.map(s => s.id))
    return { shifts: [...open.filter(s => !ids.has(s.id) && !f.estado), ...shifts], profiles }
  }, [f.de, f.ate, f.estado, f.operador])

  const profiles = byId(data?.profiles)
  const shifts = data?.shifts || []
  const fechados = shifts.filter(s => s.estado !== 'aberto')
  const sum = (k) => fechados.reduce((a, s) => a + Number(s[k]), 0)

  function exportar() {
    downloadCSV(`turnos_${f.de}_${f.ate}.csv`, [
      ['Turno', 'Operador', 'Abertura', 'Fecho', 'Estado', 'Vendas bomba', 'Outras', 'Crédito', 'A entregar', 'Entregue', 'Diferença'],
      ...shifts.map(s => [s.id, profiles[s.operador_id]?.nome, dtt(s.aberto_em), dtt(s.fechado_em), s.estado,
        s.total_bomba, s.total_outras, s.total_credito, s.total_esperado, s.total_declarado, s.diferenca]),
    ])
  }

  return (
    <div className="stack">
      <PageHead title="Turnos" sub="Cada turno começa com os contadores do fecho anterior.">
        <Btn variant="secondary" icon="download" onClick={exportar} disabled={!shifts.length}>Exportar CSV</Btn>
      </PageHead>

      <div className="panel panel-body row" style={{ alignItems: 'flex-end' }}>
        <Field label="De"><Input type="date" value={f.de} onChange={set('de')} /></Field>
        <Field label="Até"><Input type="date" value={f.ate} onChange={set('ate')} /></Field>
        <Field label="Estado">
          <Select value={f.estado} onChange={set('estado')}>
            <option value="">Todos</option><option value="aberto">Abertos</option><option value="fechado">Fechados (por validar)</option><option value="validado">Validados</option>
          </Select>
        </Field>
        <Field label="Operador">
          <Select value={f.operador} onChange={set('operador')}>
            <option value="">Todos</option>
            {(data?.profiles || []).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </Select>
        </Field>
      </div>

      <ErrorNote error={error} onRetry={reload} />
      <div className="panel">
        {loading && !data ? <Loading /> : shifts.length === 0 ? <Empty title="Sem turnos neste período">Ajusta as datas ou espera que um operador abra um turno.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr>
                <th>#</th><th>Operador</th><th>Abertura</th><th>Duração</th><th>Estado</th>
                <th className="right">Vendas</th><th className="right">Crédito</th><th className="right">A entregar</th><th className="right">Entregue</th><th className="right">Diferença</th>
              </tr></thead>
              <tbody>
                {shifts.map(s => {
                  const aberto = s.estado === 'aberto'
                  const dif = Number(s.diferenca)
                  return (
                    <tr key={s.id} className="click" onClick={() => go('turnos/' + s.id)}>
                      <td className="num">{s.id}</td>
                      <td><b>{profiles[s.operador_id]?.nome || '—'}</b></td>
                      <td className="num">{dtt(s.aberto_em)}</td>
                      <td className="num">{duration(s.aberto_em, s.fechado_em)}</td>
                      <td><EstadoTag estado={s.estado} /></td>
                      <td className="right num">{aberto ? '—' : mt(Number(s.total_bomba) + Number(s.total_outras))}</td>
                      <td className="right num">{aberto ? '—' : mt(s.total_credito)}</td>
                      <td className="right num">{aberto ? '—' : mt(s.total_esperado)}</td>
                      <td className="right num">{aberto ? '—' : mt(s.total_declarado)}</td>
                      <td className={`right num ${dif < 0 ? 'neg' : dif > 0 ? 'pos' : ''}`}><b>{aberto ? '—' : mt(dif)}</b></td>
                    </tr>
                  )
                })}
              </tbody>
              {fechados.length > 1 && (
                <tfoot><tr>
                  <td colSpan={5}>{fechados.length} turnos fechados</td>
                  <td className="right num">{mt(sum('total_bomba') + sum('total_outras'))}</td>
                  <td className="right num">{mt(sum('total_credito'))}</td>
                  <td className="right num">{mt(sum('total_esperado'))}</td>
                  <td className="right num">{mt(sum('total_declarado'))}</td>
                  <td className={`right num ${sum('diferenca') < 0 ? 'neg' : ''}`}>{mt(sum('diferenca'))}</td>
                </tr></tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
