import { useCallback, useEffect, useRef, useState } from 'react'

// Carrega dados assíncronos; reload() volta a carregar
export function useData(fn, deps = []) {
  const [state, set] = useState({ data: null, loading: true, error: null })
  const seq = useRef(0)
  const load = useCallback(async () => {
    const my = ++seq.current
    set(s => ({ ...s, loading: true, error: null }))
    try {
      const data = await fn()
      if (my === seq.current) set({ data, loading: false, error: null })
    } catch (e) {
      if (my === seq.current) set(s => ({ ...s, loading: false, error: e.message || String(e) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

// Hash router mínimo: #/rota
export function useHash() {
  const get = () => (window.location.hash.replace(/^#\/?/, '') || '')
  const [h, setH] = useState(get)
  useEffect(() => {
    const on = () => setH(get())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [h, (to) => { window.location.hash = '/' + to }]
}
