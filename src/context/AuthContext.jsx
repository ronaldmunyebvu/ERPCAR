import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getRepository, SESSION_SECRET } from '@/db'
import { signToken, verifyToken } from '@/lib/crypto'

const SESSION_KEY = 'carrental.session'

const AuthContext = createContext(null)

async function restoreSession() {
  const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  const payload = await verifyToken(raw, SESSION_SECRET)
  if (!payload) {
    sessionStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(SESSION_KEY)
    return null
  }
  const repo = await getRepository()
  const account = await repo.auth.findUserById(payload.userId)
  if (!account || account.user.status !== 'active') return null
  return { ...account, token: raw }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    restoreSession()
      .then((session) => {
        if (cancelled) return
        if (session) {
          setUser(session.user)
          setCompany(session.company)
        }
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

  const persist = useCallback(async (account) => {
    const token = await signToken(
      { userId: account.user.id, companyId: account.company.id, role: account.user.role },
      SESSION_SECRET,
    )
    sessionStorage.setItem(SESSION_KEY, token)
    localStorage.setItem(SESSION_KEY, token)
    return token
  }, [])

  const signIn = useCallback(
    async (credentials) => {
      const repo = await getRepository()
      const account = await repo.auth.signIn(credentials)
      await persist(account)
      setUser(account.user)
      setCompany(account.company)
      return account.user
    },
    [persist],
  )

  const signOut = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
    setCompany(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!user) return null
    const repo = await getRepository()
    const account = await repo.auth.findUserById(user.id)
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