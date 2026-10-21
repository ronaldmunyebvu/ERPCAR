import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Info, KeyRound, RefreshCw } from 'lucide-react'
import { dataSource } from '@/db'
import { useAuth } from '@/context/AuthContext'
import { Button, Field, Input, Alert, Card } from '@/components/ui'

/**
 * First-time member verification.
 *
 * An admin creates a staff account without a password. The staff member comes
 * here, proves their inbox with a six digit code (same single-use, ten minute,
 * attempt-counted credential as a password reset), chooses their own password,
 * and is signed in.
 */
export default function MemberSetupPage() {
  const { requestMemberSetup, completeMemberSetup } = useAuth()
  const [identity, setIdentity] = useState({ email: '', company: '' })
  const [issued, setIssued] = useState(null)
  const [form, setForm] = useState({ code: '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const issue = (next) => requestMemberSetup(next.email, next.company)

  const submitIdentity = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setIssued(await issue(identity))
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
      setIssued(await issue(identity))
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
      await completeMemberSetup({
        email: identity.email,
        company: identity.company,
        token: form.code.trim(),
        password: form.password,
      })
      setDone(true)
    } catch (cause) {
      setError(cause.message)
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
        <div className="card w-full max-w-md p-6 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={21} />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-ink-900">You are all set</h1>
          <p className="mt-1 text-sm text-ink-500">
            Your password is saved and you are signed in.
          </p>
          <Button className="mt-5 w-full" onClick={() => (window.location.href = '/app')}>
            Continue to the app
          </Button>
        </div>
      </div>
    )
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
            <KeyRound size={21} />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-ink-900">
            {issued ? 'Enter your code' : 'Set up your account'}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {issued
              ? `We sent a 6-digit code to ${issued.email}. It expires in 10 minutes.`
              : 'Enter your work email and company name, and we will send you a code to choose your password.'}
          </p>

          {error && (
            <Alert tone="danger" icon={Info} className="mt-4">
              {error}
            </Alert>
          )}

          {issued ? (
            <form onSubmit={submitCode} className="mt-5 space-y-4">
              <Alert tone="success" icon={CheckCircle2} title="Code sent">
                If an active staff account exists for <strong>{issued.email}</strong> at{' '}
                <strong>{identity.company}</strong>, the code is in its inbox now.
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
                  No account matched those details. Ask your company owner to add you, or check
                  the company name.
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

              <Field label="Choose a password" required hint="Minimum 8 characters.">
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  required
                />
              </Field>

              <Field label="Confirm password" required>
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
                Save password and sign in
              </Button>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIssued(null)}
                  className="text-xs font-medium text-ink-500 hover:text-ink-800"
                >
                  Use different details
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
            <form onSubmit={submitIdentity} className="mt-5 space-y-4">
              <Field label="Company name" required>
                <Input
                  autoComplete="organization"
                  placeholder="e.g. Falcon Car Hire"
                  value={identity.company}
                  onChange={(event) => setIdentity({ ...identity, company: event.target.value })}
                  required
                />
              </Field>
              <Field label="Work email" required>
                <Input
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  value={identity.email}
                  onChange={(event) => setIdentity({ ...identity, email: event.target.value })}
                  required
                />
              </Field>
              <Button type="submit" className="w-full" loading={busy}>
                Email me a code
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
