import { useState } from 'react'
import { Copy, KeyRound, Pencil, Plus, Trash2, UserCog, Info, Check } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRepository, useResource, useDebounced } from '@/hooks/useRepository'
import { useToast } from '@/context/ToastContext'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  SearchInput,
  Select,
  Spinner,
  TableWrapper,
  Tabs,
  Checkbox,
} from '@/components/ui'
import { RoleBadge, StatusBadge } from '@/components/domain/Badges'
import { formatDate, formatDateTime, relativeTime } from '@/lib/utils'

export default function MembersPage() {
  const { user, company } = useAuth()
  const { repository } = useRepository()
  const toast = useToast()
  const companyId = company?.id

  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 250)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [resetting, setResetting] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)

  const members = useResource(
    () => repository.users.list({ companyId, search: debouncedSearch }),
    `members|${companyId}|${debouncedSearch}`,
  )
  const activity = useResource(
    () => repository.activity.list({ companyId, limit: 500 }),
    `activity|${companyId}`,
  )

  const rows = members.data || []
  const filtered = rows.filter((member) =>
    tab === 'all' ? true : tab === 'active' ? member.status === 'active' : member.role === 'admin',
  )

  const createMember = async (values) => {
    setBusy(true)
    try {
      await repository.auth.createUser({ ...values, company_id: companyId, created_by: user.id })
      toast.success(`${values.full_name} can now sign in with the password you set.`)
      setCreating(false)
      members.reload()
      activity.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const updateMember = async (values) => {
    setBusy(true)
    try {
      await repository.auth.updateUser(editing.id, values, user)
      toast.success('Member updated.')
      setEditing(null)
      members.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const resetPassword = async (password) => {
    setBusy(true)
    try {
      await repository.auth.updateUser(resetting.id, { password }, user)
      toast.success(`Password reset for ${resetting.full_name}.`)
      setResetting(null)
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      const outcome = await repository.auth.removeUser(removing.id, user)
      toast.success(
        outcome.hardDeleted
          ? `${removing.full_name} deleted.`
          : `${removing.full_name} deactivated — their rental records were kept.`,
      )
      setRemoving(null)
      members.reload()
      activity.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Staff members"
        description="Staff accounts are created here. There is no public sign-up — only you can issue credentials."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} />
            Add member
          </Button>
        }
      />

      <Alert tone="info" icon={Info} title="How staff access works" className="mb-4">
        Members sign in with the email and password you set. They can capture rentals, manage
        customers and record payments, but cannot see company settings, manage staff or view other
        members&apos; bookings unless you allow it below.
      </Alert>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-4 py-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, email or phone…"
            className="min-w-0 flex-1 sm:max-w-sm"
          />
        </div>

        <Tabs
          className="px-2"
          tabs={[
            { value: 'all', label: 'Everyone', count: rows.length },
            {
              value: 'active',
              label: 'Active',
              count: rows.filter((member) => member.status === 'active').length,
            },
            {
              value: 'admin',
              label: 'Admins',
              count: rows.filter((member) => member.role === 'admin').length,
            },
          ]}
          value={tab}
          onChange={setTab}
        />

        {members.loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState icon={UserCog} title="No members match this view" />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th className="text-right">Rentals captured</th>
                <th>Last sign-in</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="font-medium text-ink-800">{member.full_name}</div>
                    <div className="text-xs text-ink-400">
                      {member.email}
                      {member.phone ? ` · ${member.phone}` : ''}
                    </div>
                  </td>
                  <td>
                    <RoleBadge role={member.role} size="sm" />
                  </td>
                  <td>
                    <StatusBadge status={member.status} size="sm" />
                  </td>
                  <td className="text-right tabular-nums">{member.rentals_captured || 0}</td>
                  <td className="text-ink-600">
                    {member.last_login_at ? (
                      <>
                        {relativeTime(member.last_login_at)}
                        <span className="block text-xs text-ink-400">
                          {formatDate(member.last_login_at)}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-300">Never</span>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit member"
                        onClick={() => setEditing({ ...member })}
                      >
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Reset password"
                        onClick={() => setResetting({ ...member })}
                      >
                        <KeyRound size={15} />
                      </Button>
                      {member.id !== user.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remove member"
                          onClick={() => setRemoving({ ...member })}
                        >
                          <Trash2 size={15} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-ink-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-ink-900">Member activity log</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Who did what, captured automatically by the system.
            </p>
          </div>
          {activity.loading ? (
            <Spinner />
          ) : (activity.data || []).length === 0 ? (
            <EmptyState title="No activity recorded yet" />
          ) : (
            <ul className="max-h-96 divide-y divide-ink-100 overflow-y-auto">
              {activity.data.slice(0, 40).map((entry) => (
                <li key={entry.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={entry.user?.role === 'admin' ? 'purple' : 'info'} size="sm">
                      {entry.user?.full_name || 'System'}
                    </Badge>
                    <span className="font-mono text-[10px] text-ink-400">{entry.action}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-700">{entry.summary}</p>
                  <p className="text-[11px] text-ink-400">{formatDateTime(entry.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="border-b border-ink-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-ink-900">Member permissions</h2>
            <p className="mt-0.5 text-xs text-ink-500">Change these under Company settings.</p>
          </div>
          <ul className="divide-y divide-ink-100 text-sm">
            {[
              ['members_see_all_rentals', 'Members see all rentals', 'Off by default — staff only see the bookings they captured.'],
              ['members_edit_own_rentals', 'Members edit their own rentals', 'Allow staff to amend bookings they created.'],
              ['members_manage_fleet', 'Members manage the fleet', 'Allow staff to add or edit vehicles.'],
            ].map(([key, label, description]) => (
              <li key={key} className="flex items-start gap-3 px-5 py-3">
                <span
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                    company?.[key] ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-400'
                  }`}
                >
                  {company?.[key] ? <Check size={12} /> : <span className="text-xs">–</span>}
                </span>
                <div>
                  <p className="font-medium text-ink-800">{label}</p>
                  <p className="text-xs text-ink-500">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <MemberModal
        open={creating || Boolean(editing)}
        member={editing}
        busy={busy}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSubmit={editing ? updateMember : createMember}
      />

      <ResetPasswordModal
        member={resetting}
        busy={busy}
        onClose={() => setResetting(null)}
        onSubmit={resetPassword}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={busy}
        title={`Remove ${removing?.full_name}?`}
        confirmLabel="Remove member"
        message="Members who have captured rentals are deactivated instead of deleted, so the activity log and rental records stay accurate. Members with no bookings are removed entirely."
      />
    </>
  )
}

function MemberModal({ open, member, busy, onClose, onSubmit }) {
  const isEdit = Boolean(member?.id)
  const [values, setValues] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: 'member',
    status: 'active',
    password: '',
  })
  const [errors, setErrors] = useState({})
  const [key, setKey] = useState('')
  const [copied, setCopied] = useState(false)

  const identity = member?.id || (open ? 'new' : '')
  if (identity !== key) {
    setKey(identity)
    setValues({
      full_name: member?.full_name || '',
      email: member?.email || '',
      phone: member?.phone || '',
      role: member?.role || 'member',
      status: member?.status || 'active',
      password: '',
    })
    setErrors({})
    setCopied(false)
  }

  const set = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }))

  const password = values.password

  const submit = (event) => {
    event.preventDefault()
    const found = {}
    if (!values.full_name.trim()) found.full_name = 'Full name is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) found.email = 'Enter a valid email address.'
    if (!isEdit && password.length < 8) found.password = 'Set a password of at least 8 characters.'
    if (isEdit && values.password && values.password.length < 8) {
      found.password = 'Passwords must be at least 8 characters.'
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return

    if (isEdit) {
      const patch = {
        full_name: values.full_name,
        email: values.email,
        phone: values.phone,
        role: values.role,
        status: values.status,
      }
      if (values.password) patch.password = values.password
      onSubmit(patch)
    } else {
      onSubmit({ ...values, password })
    }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${member.full_name}` : 'Add staff member'}
      description={
        isEdit
          ? 'Update the details, role or status of this account.'
          : 'Create a sign-in for a staff member. Share the password securely.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {isEdit ? 'Save changes' : 'Create member'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.full_name}>
            <Input value={values.full_name} onChange={set('full_name')} invalid={Boolean(errors.full_name)} />
          </Field>
          <Field label="Email (sign-in address)" required error={errors.email}>
            <Input
              type="email"
              value={values.email}
              onChange={set('email')}
              invalid={Boolean(errors.email)}
            />
          </Field>
          <Field label="Phone">
            <Input value={values.phone} onChange={set('phone')} />
          </Field>
          <Field label="Role" hint="Admins have full access to everything.">
            <Select value={values.role} onChange={set('role')}>
              <option value="member">Member (staff)</option>
              <option value="admin">Admin (owner)</option>
            </Select>
          </Field>
          {isEdit && (
            <Field label="Status" hint="Deactivated staff cannot sign in.">
              <Select value={values.status} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          )}
          <Field
            label={isEdit ? 'New password' : 'Password'}
            required={!isEdit}
            error={errors.password}
            hint={isEdit ? 'Leave blank to keep the current password.' : 'Minimum 8 characters.'}
          >
            <div className="flex gap-2">
              <Input
                type="text"
                value={password}
                onChange={set('password')}
                placeholder="e.g. Member@123"
                className="font-mono"
                invalid={Boolean(errors.password)}
              />
              <Button variant="secondary" onClick={copy} type="button" title="Copy password">
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </Button>
            </div>
          </Field>
        </div>

        {!isEdit && (
          <Alert tone="info" icon={Info}>
            Give this member their email and password. They can change it later from
            <strong> Account → Change password</strong>, or use <em>Forgot password</em> on the
            sign-in screen.
          </Alert>
        )}
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ member, busy, onClose, onSubmit }) {
  const [password, setPassword] = useState('')
  const [copied, setCopied] = useState(false)

  const close = () => {
    setPassword('')
    setCopied(false)
    onClose()
  }

  return (
    <Modal
      open={Boolean(member)}
      onClose={close}
      title={member ? `Reset password for ${member.full_name}` : ''}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={password.length < 8}
            loading={busy}
            onClick={async () => {
              await onSubmit(password)
              setPassword('')
            }}
          >
            Reset password
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="New password" required hint="Minimum 8 characters.">
          <div className="flex gap-2">
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="font-mono"
              placeholder="Member@123"
            />
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(password)
                setCopied(true)
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </Button>
          </div>
        </Field>
        <Checkbox
          label="Remember to hand this password to the member"
          description="They should change it after signing in, from Account → Change password."
        />
      </div>
    </Modal>
  )
}