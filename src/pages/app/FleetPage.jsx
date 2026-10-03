import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Car, Download, Pencil, Plus, Trash2, Wrench, Info } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRepository, useResource, useDebounced } from '@/hooks/useRepository'
import { useToast } from '@/context/ToastContext'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
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
      if (editing?.id) {
        await repository.cars.update(editing.id, { ...values, year: Number(values.year), daily_rate: Number(values.daily_rate) || 0 }, user)
        toast.success(`${values.registration} updated.`)
      } else {
        await repository.cars.create(
          { ...values, company_id: companyId, year: Number(values.year), daily_rate: Number(values.daily_rate) || 0 },
          user,
        )
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

  const exportCsv = () =>
    downloadCsv(`fleet-${toDateInput(new Date())}`, [
      { label: 'Registration', value: (row) => row.registration },
      { label: 'Make', value: (row) => row.make },
      { label: 'Model', value: (row) => row.model },
      { label: 'Year', value: (row) => row.year },
      { label: 'Colour', value: (row) => row.color },
      { label: 'Category', value: (row) => row.category },
      { label: 'Daily rate', value: (row) => row.daily_rate },
      { label: 'Status', value: (row) => row.status },
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
                <td colSpan={canManage ? 6 : 5} className="px-4 py-3 text-xs text-ink-500">
                  {rows.length} vehicle{rows.length === 1 ? '' : 's'}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink-800">
                  {currencySymbol(currency)}
                  {Math.round(rows.reduce((sum, car) => sum + Number(car.daily_rate || 0), 0)).toLocaleString('en-US')}
                </td>
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