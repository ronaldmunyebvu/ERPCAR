import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2,
  Car,
  CheckCircle2,
  Info,
  KeyRound,
  MailCheck,
  Phone,
  RefreshCw,
  UserPlus,
} from 'lucide-react'
import { dataSource, getRepository } from '@/db'
import {
  INITIAL_FEE_TEXT,
  MONTHLY_FEE_TEXT,
  SUPPORT_PHONE_LINKS,
} from '@/lib/platform'
import { Button, Field, Input, Textarea, Select, Alert, Card } from '@/components/ui'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ZAR', 'KES', 'NGN', 'GHS', 'ZMW', 'TZS', 'UGX', 'BWP', 'MWK']

const STEPS = [
  ['Company', Building2],
  ['Owner account', UserPlus],
  ['Verify email', MailCheck],
  ['Password', KeyRound],
  ['Payment', CheckCircle2],
]

export default function SetupPage() {
  const navigate = useNavigate()
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
  const [owner, setOwner] = useState({ full_name: '', email: '', phone: '' })
  const [issued, setIssued] = useState(null)
  const [code, setCode] = useState('')
  const [passwords, setPasswords] = useState({ password: '', confirm: '' })

  const requestCode = async () => {
    const repo = await getRepository()
    return repo.auth.requestCompanySetup({ company, owner })
  }

  const submit = async (event) => {
    event.preventDefault()
    setError(null)

    if (step === 1) {
      if (!company.name.trim()) {
        setError('Enter your company name to continue.')
        return
      }
      setStep(2)
      return
    }

    if (step === 2) {
      if (!owner.full_name.trim() || !owner.email.trim()) {
        setError('Your name and personal email address are required.')
        return
      }
      setBusy(true)
      try {
        const result = await requestCode()
        setIssued(result)
        setCode('')
        setStep(3)
      } catch (cause) {
        setError(cause.message)
      } finally {
        setBusy(false)
      }
      return
    }

    if (step === 3) {
      if (!/^\d{6}$/.test(code.trim())) {
        setError('Enter the 6-digit code we emailed you.')
        return
      }
      setBusy(true)
      try {
        const repo = await getRepository()
        await repo.auth.verifyCompanySetupCode({ email: owner.email, token: code.trim() })
        setStep(4)
      } catch (cause) {
        setError(cause.message)
      } finally {
        setBusy(false)
      }
      return
    }

    if (step === 4) {
      if (passwords.password.length < 8) {
        setError('Choose a password of at least 8 characters.')
        return
      }
      if (passwords.password !== passwords.confirm) {
        setError('The two passwords do not match.')
        return
      }
      setBusy(true)
      try {
        const repo = await getRepository()
        await repo.auth.completeCompanySetup({
          email: owner.email,
          token: code.trim(),
          password: passwords.password,
        })
        setStep(5)
      } catch (cause) {
        setError(cause.message)
      } finally {
        setBusy(false)
      }
    }
  }

  const resend = async () => {
    setBusy(true)
    setError(null)
    try {
      setIssued(await requestCode())
      setCode('')
    } catch (cause) {
      setError(cause.message)
    } finally {
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
            <h1 className="mt-4 text-2xl font-semibold text-white">Register your company</h1>
            <p className="mt-1 text-sm text-ink-400">
              Create your company, confirm your email and choose a password. Activation needs a{' '}
              {INITIAL_FEE_TEXT} once-off fee and super admin approval.
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/login')} className="bg-white/5 text-white hover:bg-white/10 hover:text-white">
            Cancel
          </Button>
        </div>

        <Card className="p-6">
          <ol className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {STEPS.map(([label, Icon], index) => {
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
                  {index < STEPS.length - 1 && <span className="h-px w-4 bg-ink-200" />}
                </li>
              )
            })}
          </ol>

          {error && (
            <Alert tone="danger" icon={Info} className="mb-4">
              {error}
            </Alert>
          )}

          {step === 5 ? (
            <div className="space-y-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={21} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-ink-900">
                  Company submitted for approval
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  <strong>{company.name}</strong> has been created, your email{' '}
                  <strong>{owner.email}</strong> is confirmed and your password is saved. To
                  activate the account, pay the initial fee and contact the super admin for
                  approval.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
                  <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">
                    Initial fee
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-ink-900">{INITIAL_FEE_TEXT}</p>
                  <p className="text-xs text-ink-500">Once-off payment</p>
                </div>
                <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
                  <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
                    Monthly subscription
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-ink-900">{MONTHLY_FEE_TEXT}</p>
                  <p className="text-xs text-ink-500">Per month, for system maintenance</p>
                </div>
              </div>

              <Alert tone="warning" icon={Phone} title="Pay and request approval">
                <p>
                  The initial fee is <strong>{INITIAL_FEE_TEXT}</strong> (a once-off payment). On a
                  monthly basis the subscription fee is <strong>{MONTHLY_FEE_TEXT}</strong>, used
                  for system maintenance.
                </p>
                <p className="mt-2">
                  Please contact the super admin on any of these numbers for approval:
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-semibold">
                  {SUPPORT_PHONE_LINKS.map((phone) => (
                    <a
                      key={phone.tel}
                      href={`tel:${phone.tel}`}
                      className="underline decoration-amber-400 underline-offset-2 hover:text-amber-900"
                    >
                      {phone.label}
                    </a>
                  ))}
                </p>
              </Alert>

              <Alert tone="info" icon={Info} title="Your account is pending">
                Sign-in is enabled only after the super admin approves your company. Until then,
                signing in with this owner account will show the approval message.
              </Alert>

              <Button variant="secondary" className="w-full" onClick={() => navigate('/login')}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {step === 1 && (
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
              )}

              {step === 2 && (
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
                    <Field
                      label="Your personal email"
                      required
                      hint="We will send a 6-digit code to this address."
                    >
                      <Input
                        type="email"
                        autoComplete="email"
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
                  </div>
                  <Alert tone="info" icon={MailCheck} title="Confirm your email first">
                    After you continue, we email a 6-digit code to your personal address. You will
                    enter the code, then set your password and continue to payment.
                  </Alert>
                </>
              )}

              {step === 3 && (
                <>
                  <Alert tone="success" icon={MailCheck} title="Code sent">
                    We emailed a 6-digit code to <strong>{issued?.email || owner.email}</strong>. It
                    expires in 10 minutes.
                  </Alert>

                  {issued?.token && (
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
                  )}

                  <Field label="6-digit code" required hint="Check your inbox and spam folder.">
                    <Input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      placeholder="000000"
                      className="text-center font-mono text-lg tracking-[0.4em]"
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                      required
                    />
                  </Field>

                  <button
                    type="button"
                    onClick={resend}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-800 disabled:opacity-50"
                  >
                    <RefreshCw size={13} />
                    Send a new code
                  </button>
                </>
              )}

              {step === 4 && (
                <>
                  <Alert tone="success" icon={CheckCircle2} title="Email confirmed">
                    Now choose the password you will use to sign in once the super admin approves
                    your company.
                  </Alert>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Password" required hint="Minimum 8 characters.">
                      <Input
                        type="password"
                        autoComplete="new-password"
                        value={passwords.password}
                        onChange={(event) =>
                          setPasswords({ ...passwords, password: event.target.value })
                        }
                        minLength={8}
                        required
                      />
                    </Field>
                    <Field label="Confirm password" required>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        value={passwords.confirm}
                        onChange={(event) =>
                          setPasswords({ ...passwords, confirm: event.target.value })
                        }
                        minLength={8}
                        required
                      />
                    </Field>
                  </div>
                </>
              )}

              <div className="flex justify-between gap-2 pt-2">
                <div>
                  {step > 1 && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setError(null)
                        setStep(step - 1)
                      }}
                      disabled={busy}
                    >
                      Back
                    </Button>
                  )}
                </div>
                <Button type="submit" loading={busy}>
                  {step === 1 && 'Continue'}
                  {step === 2 && 'Send my code'}
                  {step === 3 && 'Verify code'}
                  {step === 4 && 'Save password & continue'}
                </Button>
              </div>
            </form>
          )}
        </Card>

        {step === 5 && (
          <p className="mt-4 text-center text-xs text-ink-500">
            Need to confirm your email again?{' '}
            <Link to="/forgot-password" className="font-medium text-brand-400 hover:text-brand-300">
              Use a one-time code
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
