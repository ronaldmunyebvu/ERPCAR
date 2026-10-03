import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Info, ShieldCheck } from 'lucide-react'
import { getRepository } from '@/db'
import { useAuth } from '@/context/AuthContext'
import { Button, Field, Input, Alert } from '@/components/ui'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const token = searchParams.get('token') || ''

  const [form, setForm] = useState({ password: '', confirm: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(token ? null : 'This reset link is missing its token.')

  const strength = (() => {
    const value = form.password
    if (!value) return 0
    let score = 0
    if (value.length >= 8) score += 1
    if (value.length >= 12) score += 1
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1
    if (/\d/.test(value)) score += 1
    if (/[^A-Za-z0-9]/.test(value)) score += 1
    return score
  })()

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    if (form.password !== form.confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const repo = await getRepository()
      const updated = await repo.auth.completePasswordReset({ token, password: form.password })
      await signIn({ email: updated.email, password: form.password })
      navigate('/app', { replace: true })
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
          <h1 className="mt-4 text-xl font-semibold text-ink-900">Choose a new password</h1>
          <p className="mt-1 text-sm text-ink-500">
            Pick something you have not used before. You will be signed out on other devices.
          </p>

          {error && (
            <Alert tone="danger" icon={Info} className="mt-4">
              {error}
            </Alert>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="New password" required>
              <div className="relative">
                <Input
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="pr-11"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((value) => !value)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            {form.password && (
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((level) => (
                  <span
                    key={level}
                    className={`h-1.5 flex-1 rounded-full ${
                      strength >= level
                        ? ['bg-red-500', 'bg-amber-500', 'bg-yellow-500', 'bg-lime-500', 'bg-emerald-500'][
                            strength - 1
                          ] ?? 'bg-ink-200'
                        : 'bg-ink-200'
                    }`}
                  />
                ))}
              </div>
            )}

            <Field label="Confirm new password" required>
              <Input
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.confirm}
                onChange={(event) => setForm({ ...form, confirm: event.target.value })}
                minLength={8}
                required
              />
            </Field>

            <Button type="submit" className="w-full" loading={busy}>
              Update password
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}