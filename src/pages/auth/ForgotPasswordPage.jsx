import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Info, Mail, RefreshCw, ShieldCheck } from 'lucide-react'
import { getRepository, dataSource } from '@/db'
import { useAuth } from '@/context/AuthContext'
import { Button, Field, Input, Alert, Card } from '@/components/ui'

/**
 * Two step reset: prove the address by reading a six digit code out of the
 * mailbox, then choose the new password.
 *
 * The code is single use, expires in ten minutes, and is replaced outright by
 * asking for another — so a code copied out of an old email is worthless.
 */
export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [issued, setIssued] = useState(null)
  const [form, setForm] = useState({ code: '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const issue = async (address) => {
    const repo = await getRepository()
    return repo.auth.requestPasswordReset(address)
  }

  const submitEmail = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setIssued(await issue(email))
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setBusy(true)
    setError(null)
    try {
      setForm({ code: '', password: '', confirm: '' })
      setIssued(await issue(issued.email))
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (event) => {
    event.preventDefault()
    setError(null)
    if (form.password !== form.confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const repo = await getRepository()
      const updated = await repo.auth.completePasswordReset({
        token: form.code.trim(),
        password: form.password,
        email: issued.email,
      })
      await signIn({ email: updated.email, password: form.password })
      navigate('/app', { replace: true })
    } catch (cause) {
      setError(cause.message)
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
          <h1 className="mt-4 text-xl font-semibold text-ink-900">
            {issued ? 'Enter your code' : 'Reset your password'}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {issued
              ? `We sent a 6-digit code to ${issued.email}. It expires in 10 minutes.`
              : 'Enter the email address issued by your company owner and we will email you a code.'}
          </p>

          {error && (
            <Alert tone="danger" icon={Info} className="mt-4">
              {error}
            </Alert>
          )}

          {issued ? (
            <form onSubmit={submitCode} className="mt-5 space-y-4">
              <Alert tone="success" icon={CheckCircle2} title="Code sent">
                If an active account exists for <strong>{issued.email}</strong>, the code is in
                its inbox now.
              </Alert>

              {issued.token ? (
                <Card className="border-dashed p-4">
                  <p className="text-xs font-semibold text-ink-700">
                    {dataSource === 'mock'
                      ? 'Demo mode — no mail server, use this code:'
                      : 'Development mode — use this code directly:'}
                  </p>
                  <p className="mt-2 rounded-lg bg-ink-950 px-3 py-2 text-center font-mono text-lg tracking-[0.4em] text-emerald-300">
                    {issued.token}
                  </p>
                </Card>
              ) : dataSource === 'mock' ? (
                <p className="text-xs text-ink-500">
                  No account matched that address. Ask your company owner to add you, or try
                  another address.
                </p>
              ) : null}

              <Field label="6-digit code" required>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  placeholder="000000"
                  className="text-center font-mono text-lg tracking-[0.4em]"
                  value={form.code}
                  onChange={(event) => setForm({ ...form, code: event.target.value.replace(/\D/g, '') })}
                  required
                />
              </Field>

              <Field label="New password" required hint="Minimum 8 characters.">
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  required
                />
              </Field>

              <Field label="Confirm new password" required>
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={form.confirm}
                  onChange={(event) => setForm({ ...form, confirm: event.target.value })}
                  required
                />
              </Field>

              <Button type="submit" className="w-full" loading={busy}>
                Set new password
              </Button>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIssued(null)}
                  className="text-xs font-medium text-ink-500 hover:text-ink-800"
                >
                  Use a different email
                </button>
                <button
                  type="button"
                  onClick={resend}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-800 disabled:opacity-50"
                >
                  <RefreshCw size={13} />
                  Send a new code
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={submitEmail} className="mt-5 space-y-4">
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
                Email me a code
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
