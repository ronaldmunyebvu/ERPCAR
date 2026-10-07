import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Info, MailCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Alert, Button, Spinner } from '@/components/ui'

/**
 * Landing page for the link emailed when a car rental is created.
 *
 * The link is single use, so redemption is attempted exactly once no matter
 * how many times React runs this effect.
 */
export default function ConfirmEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { confirmEmail } = useAuth()
  const token = searchParams.get('token') || ''
  const attempted = useRef(false)
  const [error, setError] = useState(token ? null : 'This confirmation link is missing its token.')

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true
    confirmEmail(token)
      .then(() => navigate('/app', { replace: true }))
      .catch((cause) => setError(cause.message))
  }, [token, confirmEmail, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          to="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
        >
          Back to sign in
        </Link>

        <div className="card p-6">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <MailCheck size={21} />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-ink-900">Confirming your email</h1>
          <p className="mt-1 text-sm text-ink-500">
            Checking the link we sent when your company was created.
          </p>

          {error ? (
            <>
              <Alert tone="danger" icon={Info} className="mt-4">
                {error}
              </Alert>
              <Button className="mt-4 w-full" onClick={() => navigate('/login', { replace: true })}>
                Continue to sign in
              </Button>
            </>
          ) : (
            <div className="mt-5 flex items-center gap-3 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
              <Spinner />
              <span className="text-sm text-ink-600">Signing you in…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
