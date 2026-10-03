import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Info, Mail, ShieldCheck } from 'lucide-react'
import { getRepository, dataSource } from '@/db'
import { Button, Field, Input, Alert, Card } from '@/components/ui'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const repo = await getRepository()
      const outcome = await repo.auth.requestPasswordReset(email)
      setResult(outcome)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          to="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft size={15} />
          Back to sign in
        </Link>

        <div className="card p-6">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <ShieldCheck size={21} />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-ink-900">Reset your password</h1>
          <p className="mt-1 text-sm text-ink-500">
            Enter the email address issued by your company owner and we will send a reset link.
          </p>

          {error && (
            <Alert tone="danger" icon={Info} className="mt-4">
              {error}
            </Alert>
          )}

          {result ? (
            <div className="mt-5 space-y-4">
              <Alert tone="success" icon={CheckCircle2} title="Reset link created">
                If an active account exists for <strong>{result.email}</strong>, a reset link is ready.
              </Alert>

              {result.token ? (
                <Card className="border-dashed p-4">
                  <p className="text-xs font-semibold text-ink-700">
                    {dataSource === 'mock'
                      ? 'Demo mode — no mail server, use this link directly:'
                      : 'Development mode — use this link directly:'}
                  </p>
                  <p className="mt-2 break-all rounded-lg bg-ink-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-emerald-300">
                    /reset-password?token={result.token}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate(`/reset-password?token=${result.token}`)}
                  >
                    Continue to reset
                  </Button>
                </Card>
              ) : (
                <p className="text-xs text-ink-500">
                  No account matched that address. Ask your company owner to confirm your email, or
                  try another address.
                </p>
              )}

              <Button variant="ghost" className="w-full" onClick={() => setResult(null)}>
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <Field label="Email address" required>
                <Input
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>
              <Button type="submit" className="w-full" loading={busy}>
                <Mail size={15} />
                Send reset link
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}