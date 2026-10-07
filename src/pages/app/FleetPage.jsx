import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Car, Download, Pencil, Plus, Trash2, Wrench, Info } from 'lucide-react'
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
} from '@/components/ui'
import { CarStatusBadge } from '@/components/domain/Badges'
import {
  formatMoney,
  formatDate,
  titleCase,
  downloadCsv,
  toDateInput,
  CAR_STATUSES,
  currencySymbol,
  FLEET_OWNERSHIP,
  licenseState,
  ownerFullName,
  ownershipLabel,
  companySharePercent,
} from '@/lib/utils'

const CATEGORY_OPTIONS = [
  'sedan',
  'hatchback',
  'suv',
  'luxury',
  'van',
  'pickup',
  'truck',
  'bus',
  'motorcycle',
  'other',
]

const EMPTY_CAR = {
  make: '',
  model: '',
  year: new Date().getFullYear(),
  registration: '',
  color: '',
  category: 'sedan',
  daily_rate: '',
  status: 'available',
  photo_url: '',
  notes: '',
  ownership: 'owned',
  owner_first_name: '',
  owner_last_name: '',
  company_share_percent: 100,
  license_valid_from: '',
  license_valid_to: '',
}

export default function FleetPage() {
  const { user, company, isAdmin } = useAuth()
  const { repository } = useRepository()
  const toast = useToast()
  const companyId = company?.id
  const currency = company?.currency || 'USD'

  const canManage = isAdmin || company?.members_manage_fleet
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 250)

  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)

  const cars = useResource(
    () => repository.cars.list({ companyId, status, category: category || undefined, search: debouncedSearch }),
    `cars|${Boolean(repository)}|${companyId}|${status}|${category}|${debouncedSearch}`,
  )
  const categories = useResource(
    () => repository.cars.categories({ companyId }),
    `categories|${Boolean(repository)}|${companyId}`,
  )

  const rows = cars.data || []

  const counts = CAR_STATUSES.reduce(
    (acc, value) => ({ ...acc, [value]: rows.filter((car) => car.status === value).length }),
    {},
  )

  const save = async (values) => {
    setBusy(true)
    try {
      const payload = {
        ...values,
        ownership: values.ownership || 'owned',
        year: Number(values.year),
        daily_rate: Number(values.daily_rate) || 0,
      }
      if (editing?.id) {
        await repository.cars.update(editing.id, payload, user)
        toast.success(`${values.registration} updated.`)
      } else {
        await repository.cars.create({ ...payload, company_id: companyId }, user)
        toast.success(`${values.make} ${values.model} added to the fleet.`)
      }
      setEditing(null)
      cars.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await repository.cars.remove(removing.id, user)
      toast.success(`${removing.registration} removed from the fleet.`)
      setRemoving(null)
      cars.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const setStatusAction = async (car, next) => {
    try {
      await repository.cars.update(car.id, { status: next }, user)
      toast.success(`${car.registration} marked ${next}.`)
      cars.reload()
    } catch (cause) {
      toast.error(cause.message)
    }
  }

  /** Pays for a fresh 90-day Zinara term starting today. */
  const renewLicense = async (car) => {
    setBusy(true)
    try {
      await repository.cars.renewLicense(car.id, toDateInput(new Date()), user)
      toast.success(`Zinara licence for ${car.registration} renewed for 90 days.`)
      cars.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () =>
    downloadCsv(`fleet-${toDateInput(new Date())}`, [
      { label: 'Registration', value: (row) => row.registration },
      { label: 'Make', value: (row) => row.make },
      { label: 'Model', value: (row) => row.model },
      { label: 'Year', value: (row) => row.year },
      { label: 'Colour', value: (row) => row.color },
      { label: 'Category', value: (row) => row.category },
      { label: 'Ownership', value: (row) => ownershipLabel(row.ownership) },
      { label: 'Owner', value: (row) => ownerFullName(row) },
      { label: 'Company share %', value: (row) => companySharePercent(row) },
      { label: 'Daily rate', value: (row) => row.daily_rate },
      { label: 'Status', value: (row) => row.status },
      { label: 'Licence from', value: (row) => row.license_valid_from || '' },
      { label: 'Licence to', value: (row) => row.license_valid_to || '' },
      { label: 'Current rental', value: (row) => row.current_rental?.reference || '' },
      { label: 'Notes', value: (row) => row.notes || '' },
    ], rows)

  return (
    <>
      <PageHeader
        title="Fleet"
        description={
          canManage
            ? 'Add, edit and retire the vehicles you rent out.'
            : 'Read-only view of the fleet. Ask your owner to make changes.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>
              <Download size={15} />
              Export
            </Button>
            {canManage && (
              <Button onClick={() => setEditing({ ...EMPTY_CAR })}>
                <Plus size={16} />
                Add vehicle
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-4 py-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search registration, make or model…"
            className="min-w-0 flex-1 sm:max-w-sm"
          />
          <Select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-auto"
          >
            <option value="">All categories</option>
            {(categories.data || []).map((value) => (
              <option key={value} value={value}>
                {titleCase(value)}
              </option>
            ))}
          </Select>
        </div>

        <Tabs
          className="px-2"
          tabs={[
            { value: 'all', label: 'All', count: rows.length },
            ...CAR_STATUSES.map((value) => ({ value, label: titleCase(value), count: counts[value] })),
          ]}
          value={status}
          onChange={setStatus}
        />

        {cars.loading ? (
          <Spinner />
        ) : cars.error ? (
          <Alert tone="danger" title="Could not load fleet">
            {cars.error.message}
          </Alert>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Car}
            title="No vehicles found"
            message={
              search || category || status !== 'all'
                ? 'Adjust your filters to see more vehicles.'
                : 'Add your first vehicle to start renting.'
            }
            action={
              canManage && (
                <Button onClick={() => setEditing({ ...EMPTY_CAR })}>
                  <Plus size={15} />
                  Add vehicle
                </Button>
              )
            }
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Registration</th>
                <th>Category</th>
                <th>Ownership</th>
                <th>Licence</th>
                <th className="text-right">Daily rate</th>
                <th>Status</th>
                <th>Current rental</th>
                {canManage && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((car) => (
                <tr key={car.id}>
                  <td>
                    <div className="font-medium text-ink-800">
                      {car.make} {car.model}
                    </div>
                    <div className="text-xs text-ink-400">
                      {car.year} · {car.color || 'Colour n/a'}
                    </div>
                  </td>
                  <td className="font-mono text-xs">{car.registration}</td>
                  <td>{titleCase(car.category)}</td>
                  <td>
                    <Badge tone={car.ownership === 'sub_lease' ? 'warning' : 'info'} size="sm">
                      {ownershipLabel(car.ownership)}
                    </Badge>
                    {car.ownership === 'sub_lease' && (
                      <div className="mt-1 text-xs text-ink-500">
                        {ownerFullName(car) || 'Owner not recorded'} · {companySharePercent(car)}%
                        company
                      </div>
                    )}
                  </td>
                  <LicenceCell car={car} canManage={canManage} busy={busy} onRenew={renewLicense} />
                  <td className="text-right font-medium tabular-nums">
                    {formatMoney(car.daily_rate, currency)}
                  </td>
                  <td>
                    <CarStatusBadge status={car.status} size="sm" />
                  </td>
                  <td>
                    {car.current_rental ? (
                      <Link
                        to={`/app/rentals/${car.current_rental.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {car.current_rental.reference}
                        <span className="block text-xs text-ink-400">
                          due {formatDate(car.current_rental.expected_return_at)}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        {car.status === 'available' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Send to maintenance"
                            onClick={() => setStatusAction(car, 'maintenance')}
                          >
                            <Wrench size={14} />
                          </Button>
                        )}
                        {car.status === 'maintenance' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Mark available again"
                            onClick={() => setStatusAction(car, 'available')}
                          >
                            Available
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit vehicle"
                          onClick={() => setEditing({ ...car })}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remove vehicle"
                          onClick={() => setRemoving(car)}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50">
                <td colSpan={5} className="px-4 py-3 text-xs text-ink-500">
                  {rows.length} vehicle{rows.length === 1 ? '' : 's'}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink-800">
                  {currencySymbol(currency)}
                  {Math.round(rows.reduce((sum, car) => sum + Number(car.daily_rate || 0), 0)).toLocaleString('en-US')}
                </td>
                <td colSpan={2} />
                {canManage && <td />}
              </tr>
            </tfoot>
          </TableWrapper>
        )}
      </Card>

      <CarFormModal
        open={Boolean(editing)}
        car={editing}
        currency={currency}
        busy={busy}
        onClose={() => setEditing(null)}
        onSubmit={save}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={busy}
        title={`Remove ${removing?.registration}?`}
        confirmLabel="Remove vehicle"
        message="Vehicles with rental history cannot be deleted — mark them inactive instead so past records stay intact."
      />

      <Alert tone="info" icon={Info} className="mt-4">
        A vehicle with rental history cannot be deleted. Set its status to <strong>inactive</strong> to
        stop it appearing in new bookings while keeping its records.
      </Alert>
    </>
  )
}

function CarFormModal({ open, car, currency, busy, onClose, onSubmit }) {
  const [values, setValues] = useState(EMPTY_CAR)
  const [errors, setErrors] = useState({})
  const [key, setKey] = useState('')

  if (open && key !== (car?.id || 'new')) {
    setKey(car?.id || 'new')
    setValues({ ...EMPTY_CAR, ...car })
    setErrors({})
  }

  const set = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }))

  const submit = (event) => {
    event.preventDefault()
    const found = {}
    if (!values.make?.trim()) found.make = 'Make is required.'
    if (!values.model?.trim()) found.model = 'Model is required.'
    if (!values.registration?.trim()) found.registration = 'Registration is required.'
    if (!values.year || values.year < 1980) found.year = 'Enter a valid year.'
    if (!(Number(values.daily_rate) > 0)) found.daily_rate = 'Set a daily rate above zero.'
    if (values.ownership === 'sub_lease') {
      if (!values.owner_first_name?.trim()) found.owner_first_name = 'Owner first name is required.'
      if (!values.owner_last_name?.trim()) found.owner_last_name = 'Owner surname is required.'
      const share = Number(values.company_share_percent)
      if (!(share > 0 && share <= 100)) {
        found.company_share_percent = 'Enter the company share as a percentage between 1 and 100.'
      }
    }
    // Legacy vehicles may have no licence recorded yet; new ones must.
    if (!car?.id && !values.license_valid_from) {
      found.license_valid_from = 'Select the date the licence became valid.'
    }
    if (!car?.id && !values.license_valid_to) {
      found.license_valid_to = 'Select the date the licence expires.'
    }
    if (
      values.license_valid_from &&
      values.license_valid_to &&
      values.license_valid_to <= values.license_valid_from
    ) {
      found.license_valid_to = 'The expiry date must be after the start date.'
    }
    setErrors(found)
    if (Object.keys(found).length === 0) onSubmit(values)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={car?.id ? `Edit ${car.registration}` : 'Add vehicle'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {car?.id ? 'Save changes' : 'Add to fleet'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Make" required error={errors.make}>
          <Input value={values.make} onChange={set('make')} placeholder="Toyota" invalid={Boolean(errors.make)} />
        </Field>
        <Field label="Model" required error={errors.model}>
          <Input value={values.model} onChange={set('model')} placeholder="Corolla" invalid={Boolean(errors.model)} />
        </Field>
        <Field label="Registration / plate number" required error={errors.registration}>
          <Input
            value={values.registration}
            onChange={set('registration')}
            placeholder="FCH-2214"
            className="uppercase"
            invalid={Boolean(errors.registration)}
          />
        </Field>
        <Field label="Year" required error={errors.year}>
          <Input
            type="number"
            min="1980"
            max={new Date().getFullYear() + 1}
            value={values.year}
            onChange={set('year')}
          />
        </Field>
        <Field label="Colour">
          <Input value={values.color} onChange={set('color')} placeholder="White" />
        </Field>
        <Field label="Category">
          <Select value={values.category} onChange={set('category')}>
            {CATEGORY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {titleCase(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Daily rental rate"
          required
          error={errors.daily_rate}
          hint={`Amounts are shown in ${currency}.`}
        >
          <Input
            type="number"
            min="0"
            step="0.01"
            value={values.daily_rate}
            onChange={set('daily_rate')}
            placeholder="65.00"
            invalid={Boolean(errors.daily_rate)}
          />
        </Field>
        <Field label="Status" hint="Only available vehicles can be booked.">
          <Select value={values.status} onChange={set('status')}>
            {CAR_STATUSES.map((value) => (
              <option key={value} value={value}>
                {titleCase(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Ownership"
          hint="Owned by the company, or sub-leased from a private owner."
        >
          <Select value={values.ownership || 'owned'} onChange={set('ownership')}>
            {FLEET_OWNERSHIP.map((value) => (
              <option key={value} value={value}>
                {ownershipLabel(value)}
              </option>
            ))}
          </Select>
        </Field>
        {values.ownership === 'sub_lease' && (
          <>
            <Field label="Owner first name" required error={errors.owner_first_name}>
              <Input
                value={values.owner_first_name || ''}
                onChange={set('owner_first_name')}
                placeholder="Ronald"
                invalid={Boolean(errors.owner_first_name)}
              />
            </Field>
            <Field label="Owner surname" required error={errors.owner_last_name}>
              <Input
                value={values.owner_last_name || ''}
                onChange={set('owner_last_name')}
                placeholder="Munyebvu"
                invalid={Boolean(errors.owner_last_name)}
              />
            </Field>
            <Field
              label="Company revenue share"
              required
              error={errors.company_share_percent}
              hint={`The owner receives the remaining ${Math.max(
                0,
                100 - (Number(values.company_share_percent) || 0),
              )}% of every rental on this vehicle.`}
            >
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={values.company_share_percent ?? ''}
                onChange={set('company_share_percent')}
                invalid={Boolean(errors.company_share_percent)}
              />
            </Field>
          </>
        )}
        <Field
          label="Zinara licence valid from"
          required={!car?.id}
          error={errors.license_valid_from}
          hint="The first day of the current licence term."
        >
          <Input
            type="date"
            value={values.license_valid_from || ''}
            onChange={set('license_valid_from')}
            invalid={Boolean(errors.license_valid_from)}
          />
        </Field>
        <Field
          label="Zinara licence valid to"
          required={!car?.id}
          error={errors.license_valid_to}
          hint="Subscribing later restarts the term for 90 days."
        >
          <Input
            type="date"
            value={values.license_valid_to || ''}
            onChange={set('license_valid_to')}
            invalid={Boolean(errors.license_valid_to)}
          />
        </Field>
        <Field
          label="Photo URL"
          className="sm:col-span-2"
          hint="Paste an image link, or leave blank and add later."
        >
          <Input value={values.photo_url || ''} onChange={set('photo_url')} placeholder="https://…" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Input value={values.notes || ''} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  )
}

/**
 * The Zinara term for one vehicle, with the Subscribe action shown as soon as
 * it is inside the warning window or already expired.
 */
function LicenceCell({ car, canManage, busy, onRenew }) {
  const licence = licenseState(car.license_valid_to)
  if (licence.state === 'none') return <td className="text-ink-300">—</td>

  const tone =
    licence.state === 'expired' ? 'danger' : licence.state === 'expiring' ? 'warning' : 'success'
  const days = licence.days
  const caption =
    days === null
      ? 'Expiry not recorded'
      : days < 0
        ? `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
        : days === 0
          ? 'Expires today'
          : days === 1
            ? '1 day left'
            : `${days} days left`

  return (
    <td>
      <Badge tone={tone} size="sm">
        {formatDate(car.license_valid_to)}
      </Badge>
      <div className="mt-1 text-xs text-ink-500">{caption}</div>
      {canManage && (licence.state === 'expired' || licence.state === 'expiring') && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-1.5"
          loading={busy}
          onClick={() => onRenew(car)}
        >
          Subscribe
        </Button>
      )}
    </td>
  )
}