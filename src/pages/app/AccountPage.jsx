import { useState } from 'react'
import { KeyRound, LogOut, Mail, Phone, Save, Shield, Smartphone, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useRepository, useResource } from '@/hooks/useRepository'
import { useToast } from '@/context/ToastContext'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Spinner,
} from '@/components/ui'
import { RoleBadge, StatusBadge } from '@/components/domain/Badges'
import { formatDateTime, initialsOf, titleCase } from '@/lib/utils'

const PASSWORD_RULES = [
  { test: (value) => value.length >= 8, label: 'At least 8 characters' },
  { test: (value) => /[a-z]/.test(value), label: 'One lowercase letter' },
  { test: (value) => /[A-Z]/.test(value), label: 'One uppercase letter' },
  { test: (value) => /\d/.test(value), label: 'One number' },
]

export default function AccountPage() {
  const { company, user, refresh, signOut } = useAuth()
  const { repository } = useRepository()
  const toast = useToast()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(() => ({
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
  }))
  const [savingProfile, setSavingProfile] = useState(false)

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [passwordErrors, setPasswordErrors] = useState({})
  const [savingPassword, setSavingPassword] = useState(false)

  const me = useResource(
    () => (user?.id ? repository.auth.findUserById(user.id) : Promise.resolve(null)),
    `account|${user?.id}`,
  )

  const account = me.data?.user ?? null

  const setProfileField = (field) => (event) =>
    setProfile((current) => ({ ...current, [field]: event.target.value }))

  const saveProfile = async (event) => {
    event.preventDefault()
    setSavingProfile(true)
    try {
      await repository.auth.updateUser(user.id, profile, user)
      await refresh()
      toast.success('Profile updated.')
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setSavingProfile(false)
    }
  }

  const savePassword = async (event) => {
    event.preventDefault()
    const found = {}
    if (!passwords.currentPassword) found.currentPassword = 'Enter your current password.'
    if (passwords.newPassword !== passwords.confirm) {
      found.confirm = 'The two passwords do not match.'
    }
    const failed = PASSWORD_RULES.filter((rule) => !rule.test(passwords.newPassword))
    if (failed.length > 0) found.newPassword = failed[0].label
    setPasswordErrors(found)
    if (Object.keys(found).length > 0) return

    setSavingPassword(true)
    try {
      await repository.auth.changeOwnPassword({
        userId: user.id,
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      })
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' })
      toast.success('Password changed. It applies the next time you sign in.')
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setSavingPassword(false)
    }
  }

  const leave = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  if (!user) return <Spinner />

  const profileDirty =
    profile.full_name !== (user.full_name ?? '') ||
    profile.email !== (user.email ?? '') ||
    profile.phone !== (user.phone ?? '')

  return (
    <>
      <PageHeader title="My account" description="Your profile, password and sign-in security." />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Profile" icon={User} description="How your name appears across the app." />
            <form onSubmit={saveProfile}>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Full name" required className="sm:col-span-2">
                  <Input value={profile.full_name} onChange={setProfileField('full_name')} required />
                </Field>
                <Field label="Email address" hint="Used to sign in.">
                  <Input type="email" value={profile.email} onChange={setProfileField('email')} required />
                </Field>
                <Field label="Phone">
                  <Input value={profile.phone} onChange={setProfileField('phone')} />
                </Field>
              </div>
              <div className="flex justify-end border-t border-ink-100 px-5 py-3">
                <Button type="submit" loading={savingProfile} disabled={!profileDirty}>
                  <Save size={15} />
                  Save profile
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader
              title="Password"
              icon={KeyRound}
              description="Pick something you do not use anywhere else."
            />
            <form onSubmit={savePassword}>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field
                  label="Current password"
                  required
                  error={passwordErrors.currentPassword}
                  className="sm:col-span-2"
                >
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={passwords.currentPassword}
                    onChange={(event) =>
                      setPasswords((current) => ({ ...current, currentPassword: event.target.value }))
                    }
                    invalid={Boolean(passwordErrors.currentPassword)}
                    required
                  />
                </Field>
                <Field label="New password" required error={passwordErrors.newPassword}>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={passwords.newPassword}
                    onChange={(event) =>
                      setPasswords((current) => ({ ...current, newPassword: event.target.value }))
                    }
                    invalid={Boolean(passwordErrors.newPassword)}
                  />
                </Field>
                <Field label="Confirm new password" required error={passwordErrors.confirm}>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={passwords.confirm}
                    onChange={(event) =>
                      setPasswords((current) => ({ ...current, confirm: event.target.value }))
                    }
                    invalid={Boolean(passwordErrors.confirm)}
                  />
                </Field>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-ink-100 px-5 py-3 text-xs">
                {PASSWORD_RULES.map((rule) => {
                  const passed = rule.test(passwords.newPassword)
                  return (
                    <li
                      key={rule.label}
                      className={passed ? 'text-emerald-600' : 'text-ink-400'}
                    >
                      {passed ? '✓ ' : '○ '}
                      {rule.label}
                    </li>
                  )
                })}
              </ul>
              <div className="flex justify-end border-t border-ink-100 px-5 py-3">
                <Button type="submit" loading={savingPassword}>
                  <Shield size={15} />
                  Change password
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
                {initialsOf(user.full_name)}
              </span>
              <h2 className="text-base font-semibold text-ink-900">{user.full_name}</h2>
              <div className="flex items-center gap-2">
                <RoleBadge role={user.role} />
                <StatusBadge status={user.status} />
              </div>
            </div>
            <dl className="divide-y divide-ink-100 border-t border-ink-100 text-sm">
              <div className="flex items-start gap-3 px-5 py-3">
                <Mail size={15} className="mt-0.5 shrink-0 text-ink-400" />
                <div className="min-w-0">
                  <dt className="text-xs text-ink-400">Email</dt>
                  <dd className="truncate text-ink-700">{user.email}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3 px-5 py-3">
                <Phone size={15} className="mt-0.5 shrink-0 text-ink-400" />
                <div>
                  <dt className="text-xs text-ink-400">Phone</dt>
                  <dd className="text-ink-700">{user.phone || '—'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3 px-5 py-3">
                <Smartphone size={15} className="mt-0.5 shrink-0 text-ink-400" />
                <div>
                  <dt className="text-xs text-ink-400">Last sign-in</dt>
                  <dd className="text-ink-700">
                    {account?.last_login_at ? formatDateTime(account.last_login_at) : 'This session'}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3 px-5 py-3">
                <Shield size={15} className="mt-0.5 shrink-0 text-ink-400" />
                <div>
<dt className="text-xs text-ink-400">Member since</dt>
                  <dd className="text-ink-700">
                    {account?.created_at ? formatDateTime(account.created_at) : <>&mdash;</>}
                  </dd>
                </div>
              </div>
            </dl>
          </Card>

          {company && (
            <Card>
              <CardHeader title="Company" />
              <div className="space-y-2 p-5 text-sm">
                <p className="font-semibold text-ink-900">{company.name}</p>
                <p className="text-xs text-ink-500">
                  You are signed in as {titleCase(user.role)} with {company.currency} as the reporting
                  currency.
                </p>
              </div>
            </Card>
          )}

          {company?.password_reset_enabled && (
            <Alert tone="info" title="Password resets are enabled">
              If you forget your password you can request a reset link from the sign-in screen.
            </Alert>
          )}

          <Card>
            <CardHeader title="Session" />
            <div className="p-5">
              <p className="mb-3 text-xs leading-relaxed text-ink-500">
                Signing out clears this browser's session token. Your data stays exactly where it is.
              </p>
              <Button variant="danger" className="w-full" onClick={leave}>
                <LogOut size={15} />
                Sign out
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}