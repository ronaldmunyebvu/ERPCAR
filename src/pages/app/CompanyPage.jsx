import { useState } from 'react'
import { Building2, Check, Coins, Database, Info, RotateCcw, Save, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { isNeonMode } from '@/db'
import { useRepository, useResource } from '@/hooks/useRepository'
import { useToast } from '@/context/ToastContext'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Field,
  Input,
  SegmentedControl,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ZAR', 'KES', 'NGN', 'GHS', 'ZMW', 'TZS', 'UGX', 'BWP', 'MWK', 'AUD', 'CAD']
const TIMEZONES = [
  'Africa/Harare',
  'Africa/Lusaka',
  'Africa/Maputo',
  'Africa/Johannesburg',
  'Africa/Nairobi',
  'Africa/Accra',
  'Africa/Lagos',
  'Europe/London',
  'America/New_York',
  'UTC',
]

export default function CompanyPage() {
  const { company, user, refresh } = useAuth()
  const { repository } = useRepository()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})

  const counts = useResource(
    () => (company?.id ? repository.reports.dashboard(company.id) : Promise.resolve(null)),
    `company|${company?.id}`,
  )

  const [values, setValues] = useState(() => ({
    name: company?.name || '',
    email: company?.email || '',
    phone: company?.phone || '',
    address: company?.address || '',
    city: company?.city || '',
    country: company?.country || '',
    logo_url: company?.logo_url || '',
    currency: company?.currency || 'USD',
    timezone: company?.timezone || 'UTC',
    members_see_all_rentals: Boolean(company?.members_see_all_rentals),
    members_edit_own_rentals: Boolean(company?.members_edit_own_rentals),
    members_manage_fleet: Boolean(company?.members_manage_fleet),
    password_reset_enabled: Boolean(company?.password_reset_enabled),
  }))
  const [initial, setInitial] = useState(values)

  const set = (field) => (event) =>
    setValues((current) => ({
      ...current,
      [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }))

  const dirty = JSON.stringify(values) !== JSON.stringify(initial)

  const submit = async (event) => {
    event.preventDefault()
    const found = {}
    if (!values.name.trim()) found.name = 'Company name is required.'
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      found.email = 'Enter a valid email address.'
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setBusy(true)
    try {
      await repository.companies.update(company.id, values, user)
      await refresh()
      setInitial(values)
      toast.success('Company settings saved.')
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const resetDemo = async () => {
    setBusy(true)
    try {
      await repository.resetDemoData()
      toast.success('Demo data restored.')
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  if (!company) return <Spinner />

  return (
    <>
      <PageHeader
        title="Company"
        description="Business details, currency and what staff members are allowed to do."
        actions={
          <Button onClick={submit} loading={busy} disabled={!dirty}>
            <Save size={15} />
            {dirty ? 'Save changes' : 'Saved'}
          </Button>
        }
      />

      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Business details" icon={Building2} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Company name" required error={errors.name} className="sm:col-span-2">
                <Input value={values.name} onChange={set('name')} invalid={Boolean(errors.name)} />
              </Field>
              <Field label="Contact email" error={errors.email}>
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
              <Field label="Address" className="sm:col-span-2">
                <Textarea rows={2} value={values.address} onChange={set('address')} />
              </Field>
              <Field label="City">
                <Input value={values.city} onChange={set('city')} />
              </Field>
              <Field label="Country">
                <Input value={values.country} onChange={set('country')} />
              </Field>
              <Field label="Logo URL" className="sm:col-span-2">
                <Input value={values.logo_url} onChange={set('logo_url')} placeholder="https://…" />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Currency & locale"
              icon={Coins}
              description="All amounts, reports and receipts use this currency."
            />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Reporting currency">
                <Select value={values.currency} onChange={set('currency')}>
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Timezone">
                <Select value={values.timezone} onChange={set('timezone')}>
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Staff permissions"
              icon={ShieldCheck}
              description="What members can do once they sign in. You always keep full access."
            />
            <div className="space-y-4 p-5">
              <Checkbox
                label="Members see all rentals"
                description="When off, each member only sees the bookings they captured."
                checked={values.members_see_all_rentals}
                onChange={set('members_see_all_rentals')}
              />
              <Checkbox
                label="Members can edit their own rentals"
                description="Allows staff to amend bookings and dates they created."
                checked={values.members_edit_own_rentals}
                onChange={set('members_edit_own_rentals')}
              />
              <Checkbox
                label="Members can manage the fleet"
                description="Allows staff to add, edit and retire vehicles."
                checked={values.members_manage_fleet}
                onChange={set('members_manage_fleet')}
              />
              <Checkbox
                label="Allow self-service password resets"
                description="Members can use the forgot-password link on the sign-in screen."
                checked={values.password_reset_enabled}
                onChange={set('password_reset_enabled')}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="At a glance" icon={Database} />
            {counts.loading || !counts.data ? (
              <Spinner />
            ) : (
              <dl className="divide-y divide-ink-100 text-sm">
                {[
                  ['Vehicles in fleet', counts.data.counts.cars_total],
                  ['Customer records', counts.data.counts.customers_total],
                  ['Total rentals', counts.data.counts.rentals_total],
                  ['Active staff', counts.data.counts.members_active],
                  ['Currency', company.currency],
                  [
                    'Data source',
                    isNeonMode() ? 'Neon Postgres' : 'Browser storage (demo)',
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-5 py-2.5">
                    <dt className="text-ink-500">{label}</dt>
                    <dd className="font-semibold text-ink-900">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <Card>
            <CardHeader title="Data source" icon={Database} />
            <div className="space-y-3 p-5 text-sm">
              <SegmentedControl
                value={isNeonMode() ? 'neon' : 'mock'}
                options={[
                  { value: 'neon', label: 'Neon Postgres' },
                  { value: 'mock', label: 'Demo data' },
                ]}
                onChange={() => {}}
                className="w-full"
              />
              <p className="text-xs leading-relaxed text-ink-500">
                Controlled by <code className="rounded bg-ink-100 px-1">VITE_DATA_SOURCE</code> in
                the <code className="rounded bg-ink-100 px-1">.env</code> file, then restart the dev
                server.
              </p>
              {isNeonMode() ? (
                <Alert tone="success" icon={Check}>
                  Live data is being read from and written to Neon Postgres.
                </Alert>
              ) : (
                <Alert tone="warning" icon={Info}>
                  Demo mode stores everything in this browser only. Nothing is shared between
                  devices.
                </Alert>
              )}
              {!isNeonMode() && (
                <Button variant="secondary" className="w-full" onClick={resetDemo} loading={busy}>
                  <RotateCcw size={15} />
                  Restore demo data
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Danger zone" icon={Info} />
            <div className="p-5">
              <p className="text-xs leading-relaxed text-ink-500">
                Deleting the company removes every user, vehicle, customer, rental and payment that
                belongs to it. Use the Neon console if you ever need to do this.
              </p>
              <Button variant="danger" className="mt-3 w-full" disabled>
                Delete company
              </Button>
            </div>
          </Card>
        </div>
      </form>
    </>
  )
}