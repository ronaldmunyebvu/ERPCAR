import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Spinner, EmptyState, Button } from '@/components/ui'
import { ShieldAlert } from 'lucide-react'

function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-50">
      <Spinner label="Starting workspace…" />
    </div>
  )
}

export function RequireAuth({ children }) {
  const { isAuthenticated, ready } = useAuth()
  const location = useLocation()

  if (!ready) return <FullScreenLoader />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

export function RequireAdmin({ children }) {
  const { isAdmin, ready } = useAuth()
  if (!ready) return <FullScreenLoader />
  if (!isAdmin) return <Navigate to="/app" replace />
  return children
}

/**
 * Duty gate: hides a section from staff who were not assigned it. Admins are
 * never blocked (they hold every duty), and a member whose duties are empty
 * has full access — the same rule the repositories apply.
 */
export function RequireDuty({ duty, children }) {
  const { can, ready } = useAuth()
  if (!ready) return <FullScreenLoader />
  if (!can(duty)) return <Navigate to="/app" replace />
  return children
}

export function RedirectIfAuthenticated({ children }) {
  const { isAuthenticated, ready } = useAuth()
  if (!ready) return <FullScreenLoader />
  if (isAuthenticated) return <Navigate to="/app" replace />
  return children
}

export function NotFound() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="Page not found"
      message="The page you are looking for does not exist or you do not have permission to view it."
      action={
        <Button onClick={() => window.location.assign('/app')}>
          Back to dashboard
        </Button>
      }
      className="py-24"
    />
  )
}