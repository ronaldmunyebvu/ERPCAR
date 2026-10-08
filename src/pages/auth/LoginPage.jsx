import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Car, Eye, EyeOff, Info } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { getRepository } from '@/db'
import { Button, Field, Input, Alert, Spinner, Card } from '@/components/ui'


export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [setupRequired, setSetupRequired] = useState(null)

  useEffect(() => {
    let alive = true
    getRepository()
      .then((repo) => repo.auth.isSetupComplete())
      .then((complete) => {
        if (!alive) return
        if (!complete) {
          navigate('/setup', { replace: true })
          return
        }
        setSetupRequired(true)
      })
      .catch(() => {
        if (alive) setSetupRequired(true)
      })
    return () => {
      alive = false
    }
  }, [navigate])

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(form)
      navigate('/app', { replace: true })
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  if (setupRequired === null) return <Spinner />

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-ink-950 lg:flex lg:w-1/2 lg:flex-col lg:justify-between">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand-600/25 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-80 w-80 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative p-12">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-white">
              <Car size={23} />
            </span>
            <div>
              <p className="text-lg font-semibold text-white">VNexus 360</p>
              <p className="text-xs text-ink-400">Car Rental Management System</p>
            </div>
          </div>
          <h1 className="mt-16 max-w-md text-4xl leading-tight font-semibold text-white">
            Run your car hire business from one screen.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-400">
            Fleet availability, rental bookings, customer records, payments and staff activity — all
            tracked per company, with clear separation between owner and staff access.
          </p>
        </div>
        <div className="relative grid grid-cols-3 gap-4 p-12 text-sm">
          {[
            ['Fleet', 'Live availability'],
            ['Rentals', 'Overdue flagged'],
            ['Reports', 'Revenue & usage'],
          ].map(([title, subtitle]) => (
            <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-white">{title}</p>
              <p className="text-xs text-ink-400">{subtitle}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
              <Car size={20} />
            </span>
            <div>
              <p className="font-semibold text-ink-900">VNexus 360</p>
              <p className="text-xs text-ink-500">Car Rental Management System</p>
            </div>
          </div>

          <h2 className="text-2xl font-semibold text-ink-900">Sign in</h2>
          <p className="mt-1 text-sm text-ink-500">
            Use the credentials issued by your company owner. Staff accounts are created by the
            admin — there is no public sign-up.
          </p>

          {error && (
            <Alert tone="danger" icon={Info} className="mt-5">
              {error}
            </Alert>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email address" required>
              <Input
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
            </Field>

            <Field label="Password" required>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pr-11"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Forgot password?
              </Link>
            </div>

            <Button type="submit" size="lg" loading={busy} className="w-full">
              Sign in
            </Button>
          </form>

          <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <p className="text-sm font-semibold text-brand-800">Create your car rental</p>
            <p className="mt-1 text-xs leading-5 text-brand-700">
              Set up your business, add your rental name, and optionally upload a logo in seconds.
            </p>
            <Button variant="secondary" className="mt-3 w-full" onClick={() => navigate('/setup')}>
              Start your rental business
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}