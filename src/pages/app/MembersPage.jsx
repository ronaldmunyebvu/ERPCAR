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
import { DUTIES } from '@/lib/duties'
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
    tab === 'all'
      ? true
      : tab === 'active'
        ? member.status === 'active'
        : tab === 'setup'
          ? member.has_password === false
          : member.role === 'admin',
  )

  const createMember = async (values) => {
    setBusy(true)
    try {
      await repository.auth.createUser({ ...values, company_id: companyId, created_by: user.id })
      toast.success(
        `${values.full_name} created. They set their own password from “Set up your account” on the sign-in page.`,
      )
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
        Create the account with a role and the duties they need — no password is set here. The
        member signs in with their email, chooses <strong>Member</strong>, enters the company name,
        then uses <strong>Set up your account</strong> once to verify by code and choose their own
        password. Duties control which sections they can open; a member with none selected has
        full access.
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
            {
              value: 'setup',
              label: 'Awaiting setup',
              count: rows.filter((member) => member.has_password === false).length,
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
                <th>Duties</th>
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
                    {member.role === 'admin' ? (
                      <span className="text-xs text-ink-500">Full access</span>
                    ) : (member.duties || []).length === 0 ? (
                      <span className="text-xs text-ink-400">Full access (none selected)</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {DUTIES.filter((duty) => member.duties.includes(duty.key)).map((duty) => (
                          <Badge key={duty.key} tone="info" size="sm">
                            {duty.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={member.status} size="sm" />
                      {member.has_password === false && (
                        <Badge tone="warning" size="sm">
                          Awaiting setup
                        </Badge>
                      )}
                    </div>
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
    duties: [],
  })
  const [errors, setErrors] = useState({})
  const [key, setKey] = useState('')

  const identity = member?.id || (open ? 'new' : '')
  if (identity !== key) {
    setKey(identity)
    setValues({
      full_name: member?.full_name || '',
      email: member?.email || '',
      phone: member?.phone || '',
      role: member?.role || 'member',
      status: member?.status || 'active',
      duties: Array.isArray(member?.duties) ? [...member.duties] : [],
    })
    setErrors({})
  }

  const set = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }))

  const toggleDuty = (dutyKey) => () =>
    setValues((current) => ({
      ...current,
      duties: current.duties.includes(dutyKey)
        ? current.duties.filter((value) => value !== dutyKey)
        : [...current.duties, dutyKey],
    }))

  const submit = (event) => {
    event.preventDefault()
    const found = {}
    if (!values.full_name.trim()) found.full_name = 'Full name is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) found.email = 'Enter a valid email address.'
    if (!values.role) found.role = 'Choose a role.'
    if (values.role === 'member' && values.duties.length === 0) {
      found.duties = 'Pick at least one duty, or switch the role to admin for full access.'
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const patch = {
      full_name: values.full_name,
      email: values.email,
      phone: values.phone,
      role: values.role,
      status: values.status,
      duties: values.role === 'admin' ? [] : values.duties,
    }
    onSubmit(patch)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${member.full_name}` : 'Add staff member'}
      description={
        isEdit
          ? 'Update the details, role or duties of this account.'
          : 'Create the account without a password — the member sets their own on first sign-in.'
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
          <Field
            label="Role"
            required
            error={errors.role}
            hint="Admins have full access to everything."
          >
            <Select value={values.role} onChange={set('role')} invalid={Boolean(errors.role)}>
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
        </div>

        {values.role === 'member' && (
          <Field
            label="Duties"
            required
            error={errors.duties}
            hint="Tick the sections this member may open. Leaving all unticked grants full access."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {DUTIES.map((duty) => (
                <Checkbox
                  key={duty.key}
                  label={duty.label}
                  description={duty.description}
                  checked={values.duties.includes(duty.key)}
                  onChange={toggleDuty(duty.key)}
                />
              ))}
            </div>
          </Field>
        )}

        {!isEdit && (
          <Alert tone="info" icon={Info}>
            No password is set here. Give this member their email and the company name; they open
            <strong> Set up your account</strong> on the sign-in page, verify with the code we email
            them, and choose their own password.
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
              placeholder="Temp@2026"
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