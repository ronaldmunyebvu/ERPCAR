import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Car, Info, MailCheck, UserPlus } from 'lucide-react'
import { getRepository } from '@/db'
import { useAuth } from '@/context/AuthContext'
import { Button, Field, Input, Textarea, Select, Alert, Card } from '@/components/ui'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ZAR', 'KES', 'NGN', 'GHS', 'ZMW', 'TZS', 'UGX', 'BWP', 'MWK']

export default function SetupPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [company, setCompany] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    logo_url: '',
    currency: 'USD',
  })
  const [owner, setOwner] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '' })
  const [created, setCreated] = useState(null)

  const submit = async (event) => {
    event.preventDefault()
    setError(null)

    if (step === 1 && !company.name.trim()) {
      setError('Enter your company name to continue.')
      return
    }
    if (step === 2) {
      if (!owner.full_name.trim() || !owner.email.trim()) {
        setError('Your name and email address are required.')
        return
      }
      if (owner.password.length < 8) {
        setError('Choose a password of at least 8 characters.')
        return
      }
      if (owner.password !== owner.confirm) {
        setError('The two passwords do not match.')
        return
      }
    }

    if (step === 1) {
      setStep(2)
      return
    }

    setBusy(true)
    try {
      const repo = await getRepository()
      const outcome = await repo.auth.createCompanyWithOwner({ company, owner })
      setCreated(outcome)
      setStep(3)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  /**
   * The account exists at this point; the confirmation link is a nicety, not a
   * gate, so the owner can walk straight in with the password they just chose.
   */
  const signInNow = async () => {
    setError(null)
    setBusy(true)
    try {
      await signIn({ email: owner.email.trim().toLowerCase(), password: owner.password })
      navigate('/app', { replace: true })
    } catch (cause) {
      setError(cause.message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-start justify-between gap-3 text-center">
          <div className="flex-1">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-white">
              <Car size={24} />
            </span>
            <h1 className="mt-4 text-2xl font-semibold text-white">Set up your company</h1>
            <p className="mt-1 text-sm text-ink-400">
              This runs once. It creates your company and its owner (admin) account.
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/login')} className="bg-white/5 text-white hover:bg-white/10 hover:text-white">
            Cancel
          </Button>
        </div>

        <Card className="p-6">
          <ol className="mb-6 flex items-center gap-3 text-sm">
            {[
              ['Company', Building2],
              ['Owner account', UserPlus],
              ['Confirmation', MailCheck],
            ].map(([label, Icon], index) => {
              const number = index + 1
              const active = step === number
              const done = step > number
              return (
                <li key={label} className="flex items-center gap-2">
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                      done
                        ? 'bg-emerald-500 text-white'
                        : active
                          ? 'bg-brand-600 text-white'
                          : 'bg-ink-100 text-ink-400'
                    }`}
                  >
                    {done ? '✓' : <Icon size={14} />}
                  </span>
                  <span className={active ? 'font-medium text-ink-900' : 'text-ink-400'}>{label}</span>
                  {index === 0 && <span className="h-px flex-1 bg-ink-200" />}
                </li>
              )
            })}
          </ol>

          {error && (
            <Alert tone="danger" icon={Info} className="mb-4">
              {error}
            </Alert>
          )}

          {step === 3 ? (
            <div className="space-y-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <MailCheck size={21} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-ink-900">Check your email</h2>
                <p className="mt-1 text-sm text-ink-500">
                  A confirmation link is on its way to <strong>{owner.email}</strong>. Opening it
                  confirms your address and signs you straight in. The link works once and expires
                  after 24 hours.
                </p>
              </div>

              {created?.email_sent === false && created?.confirmation_token ? (
                <Card className="border-dashed p-4">
                  <p className="text-xs font-semibold text-ink-700">
                    No mail server was reachable — open the link directly:
                  </p>
                  <p className="mt-2 break-all rounded-lg bg-ink-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-emerald-300">
                    /confirm-email?token={created.confirmation_token}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate(`/confirm-email?token=${created.confirmation_token}`)}
                  >
                    Open the confirmation link
                  </Button>
                </Card>
              ) : (
                <Alert tone="info" icon={Info} title="No need to wait">
                  Your account is already active, so you can sign in with your password whenever
                  you like — the email is simply there to confirm the address.
                </Alert>
              )}

              <div className="flex justify-between gap-2 pt-2">
                <Button variant="secondary" onClick={() => navigate('/login')} disabled={busy}>
                  Go to sign in
                </Button>
                <Button onClick={signInNow} loading={busy}>
                  Sign in now
                </Button>
              </div>
            </div>
          ) : (
          <form onSubmit={submit} className="space-y-4">
            {step === 1 ? (
              <>
                <Field label="Company name" required>
                  <Input
                    value={company.name}
                    onChange={(event) => setCompany({ ...company, name: event.target.value })}
                    placeholder="Falcon Car Hire"
                    required
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Company email">
                    <Input
                      type="email"
                      value={company.email}
                      onChange={(event) => setCompany({ ...company, email: event.target.value })}
                      placeholder="info@company.com"
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      value={company.phone}
                      onChange={(event) => setCompany({ ...company, phone: event.target.value })}
                      placeholder="+263 712 000 111"
                    />
                  </Field>
                  <Field label="City">
                    <Input
                      value={company.city}
                      onChange={(event) => setCompany({ ...company, city: event.target.value })}
                    />
                  </Field>
                  <Field label="Country">
                    <Input
                      value={company.country}
                      onChange={(event) => setCompany({ ...company, country: event.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Business address">
                  <Textarea
                    rows={2}
                    value={company.address}
                    onChange={(event) => setCompany({ ...company, address: event.target.value })}
                  />
                </Field>
                <Field label="Brand logo URL (optional)" hint="Paste a website or image URL for your rental brand logo.">
                  <Input
                    type="url"
                    value={company.logo_url}
                    onChange={(event) => setCompany({ ...company, logo_url: event.target.value })}
                    placeholder="https://example.com/logo.png"
                  />
                </Field>
                <Field
                  label="Reporting currency"
                  hint="Used for all amounts, reports and invoices."
                >
                  <Select
                    value={company.currency}
                    onChange={(event) => setCompany({ ...company, currency: event.target.value })}
                  >
                    {CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            ) : (
              <>
                <Field label="Your full name" required>
                  <Input
                    value={owner.full_name}
                    onChange={(event) => setOwner({ ...owner, full_name: event.target.value })}
                    placeholder="Tendai Moyo"
                    required
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Your email" required hint="This is your sign-in address.">
                    <Input
                      type="email"
                      value={owner.email}
                      onChange={(event) => setOwner({ ...owner, email: event.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Your phone">
                    <Input
                      value={owner.phone}
                      onChange={(event) => setOwner({ ...owner, phone: event.target.value })}
                    />
                  </Field>
                  <Field label="Password" required hint="Minimum 8 characters.">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={owner.password}
                      onChange={(event) => setOwner({ ...owner, password: event.target.value })}
                      minLength={8}
                      required
                    />
                  </Field>
                  <Field label="Confirm password" required>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={owner.confirm}
                      onChange={(event) => setOwner({ ...owner, confirm: event.target.value })}
                      minLength={8}
                      required
                    />
                  </Field>
                </div>
                <Alert tone="info" icon={Info} title="What happens next">
                  You become the owner with full access. From the admin panel you can add staff
                  accounts — staff cannot self-register.
                </Alert>
              </>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <div>
                {step === 2 && (
                  <Button variant="secondary" onClick={() => setStep(1)} disabled={busy}>
                    Back
                  </Button>
                )}
              </div>
              <Button type="submit" loading={busy}>
                {step === 1 ? 'Continue' : 'Create company & owner'}
              </Button>
            </div>
          </form>
          )}
        </Card>
      </div>
    </div>
  )
}