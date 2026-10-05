import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getRepository, isLiveMode } from '@/db'
import * as authApi from '@/db/remote/auth.api'
import { signToken, verifyToken } from '@/lib/crypto'

/**
 * Auth state.
 *
 * In live mode (always enabled for production builds) there is deliberately no
 * token in this module: the session is an `httpOnly` cookie that the server
 * reads, verifies, and re-checks against the users table on every request.
 * Nothing to steal from `localStorage`, nothing to forge, and no signing key in
 * the bundle.
 *
 * Demo mode has no server to hold a cookie, so it keeps the original local
 * token purely to preserve the offline experience. That path stores only
 * browser-local mock data and is never used in production.
 */

const AuthContext = createContext(null)
const SESSION_KEY = 'carrental.session'
const MOCK_SECRET = 'demo-only-insecure-session-secret'

function readMockSession() {
  const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY)
  return raw ? verifyToken(raw, MOCK_SECRET) : Promise.resolve(null)
}

function clearMockSession() {
  sessionStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_KEY)
}

async function accountFromMockToken() {
  const payload = await readMockSession()
  if (!payload) return null
  const repo = await getRepository()
  const account = await repo.auth.findUserById(payload.userId)
  if (!account || account.user.status !== 'active') return null
  return { ...account, token: payload }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    const restore = isLiveMode() ? authApi.restore() : accountFromMockToken()

    restore
      .then((account) => {
        if (cancelled || !account) return
        setUser(account.user)
        setCompany(account.company)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause.message)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (credentials) => {
    const account = isLiveMode()
      ? await authApi.signIn(credentials.email, credentials.password)
      : await getRepository().then(async (repo) => {
          const found = await repo.auth.signIn(credentials)
          const token = await signToken(
            { userId: found.user.id, companyId: found.company.id, role: found.user.role },
            MOCK_SECRET,
          )
          sessionStorage.setItem(SESSION_KEY, token)
          localStorage.setItem(SESSION_KEY, token)
          return found
        })
    setUser(account.user)
    setCompany(account.company)
    return account.user
  }, [])

  const signOut = useCallback(async () => {
    if (isLiveMode()) await authApi.signOut().catch(() => {})
    else clearMockSession()
    setUser(null)
    setCompany(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!user) return null
    const account = isLiveMode()
      ? await authApi.restore()
      : await getRepository().then((repo) => repo.auth.findUserById(user.id))
    if (account) {
      setUser(account.user)
      setCompany(account.company)
    }
    return account
  }, [user])

  const value = useMemo(
    () => ({
      user,
      company,
      ready,
      error,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      isMember: user?.role === 'member',
      signIn,
      signOut,
      refresh,
      clearError: () => setError(null),
    }),
    [user, company, ready, error, signIn, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}