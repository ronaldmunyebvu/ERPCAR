import { useCallback, useEffect, useRef, useState } from 'react'
import { getRepository } from '@/db'

/** Resolves the active repository (mock or Neon) once per app lifetime. */
export function useRepository() {
  const [repository, setRepository] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    getRepository()
      .then((repo) => {
        if (alive) setRepository(repo)
      })
      .catch((cause) => {
        if (alive) setError(cause)
      })
    return () => {
      alive = false
    }
  }, [])

  return { repository, error }
}

/**
 * Minimal data-fetching hook.
 *
 * `key` is a single string that changes whenever the query should re-run; the
 * loader closure is always read fresh, so callers can close over live values
 * without listing them as dependencies.
 */
export function useResource(loader, key) {
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState({ data: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: null }))
    Promise.resolve()
      .then(() => loaderRef.current())
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, loading: false, error })
      })
    return () => {
      cancelled = true
    }
  }, [key, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  const setData = useCallback((updater) => {
    setState((current) => ({
      ...current,
      data: typeof updater === 'function' ? updater(current.data) : updater,
    }))
  }, [])

  return { ...state, reload, setData }
}

/** Debounced mirror of a value, for search inputs. */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** True while the returned car is past its expected return time. */
export function useOverdueTicker(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}