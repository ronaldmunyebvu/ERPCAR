import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  Camera,
  Car,
  CheckCircle2,
  Info,
  Minus,
  Plus,
  Save,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
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
  Select,
  Spinner,
  Textarea,
} from '@/components/ui'
import { CarStatusBadge } from '@/components/domain/Badges'
import { CustomerFormModal } from '@/components/domain/CustomerForm'
import { PhotoCapture } from '@/components/domain/PhotoCapture'
import {
  formatMoney,
  formatNumber,
  toDateTimeInput,
  daysBetween,
  currencySymbol,
  PAYMENT_METHODS,
  titleCase,
  toDate,
} from '@/lib/utils'

function defaultForm() {
  const pickup = new Date()
  pickup.setMinutes(0, 0, 0)
  const expected = new Date(pickup)
  expected.setDate(expected.getDate() + 3)
  expected.setHours(18, 0, 0, 0)

  return {
    car_id: '',
    customer_id: '',
    pickup_at: toDateTimeInput(pickup),
    expected_return_at: toDateTimeInput(expected),
    daily_rate: '',
    deposit_amount: '',
    start_mileage: '',
    expected_km_per_day: '',
    additional_charges: [],
    payment_method: 'cash',
    notes: '',
  }
}

export default function RentalFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const toast = useToast()
  const { user, company } = useAuth()
  const { repository } = useRepository()

  const companyId = company?.id
  const currency = company?.currency || 'USD'

  const [form, setForm] = useState(defaultForm)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [status, setStatus] = useState('active')
  const [pickupPhotos, setPickupPhotos] = useState([])

  const cars = useResource(
    () => repository.cars.list({ companyId, status: 'available' }),
    `cars|${Boolean(repository)}|${companyId}`,
  )
  const allCars = useResource(
    () => repository.cars.list({ companyId }),
    `allcars|${Boolean(repository)}|${companyId}`,
  )
  const customers = useResource(
    () => repository.customers.list({ companyId, search: customerSearch }),
    `customers|${Boolean(repository)}|${companyId}|${customerSearch}`,
  )
  const existing = useResource(
    () => (isEdit ? repository.rentals.get(id, { companyId }) : Promise.resolve(null)),
    `rental|${Boolean(repository)}|${id}|${companyId}`,
  )
  const existingPhotos = useResource(
    () =>
      isEdit
        ? repository.rentals.photos(id, { companyId })
        : Promise.resolve([]),
    `rentalphotos|${Boolean(repository)}|${id}|${companyId}`,
  )

  useEffect(() => {
    if (!isEdit || !existing.data) return
    const rental = existing.data
    setForm({
      car_id: rental.car_id,
      customer_id: rental.customer_id,
      pickup_at: toDateTimeInput(rental.pickup_at),
      expected_return_at: toDateTimeInput(rental.expected_return_at),
      daily_rate: String(rental.daily_rate),
      deposit_amount: String(rental.deposit_amount ?? ''),
      start_mileage: rental.start_mileage != null ? String(rental.start_mileage) : '',
      expected_km_per_day:
        rental.expected_km_per_day != null ? String(rental.expected_km_per_day) : '',
      additional_charges: (rental.additional_charges || []).map((charge) => ({ ...charge })),
      payment_method: rental.payments?.[0]?.method || 'cash',
      notes: rental.notes || '',
    })
    setStatus(rental.status)
  }, [isEdit, existing.data])

  const selectedCar = useMemo(() => {
    const pool = isEdit ? allCars.data || [] : cars.data || []
    return pool.find((car) => car.id === form.car_id) || null
  }, [allCars.data, cars.data, form.car_id, isEdit])

  const selectedCustomer = (customers.data || []).find(
    (customer) => customer.id === form.customer_id,
  )

  // Auto-fill the daily rate from the chosen vehicle until the user edits it.
  useEffect(() => {
    if (!isEdit && selectedCar && form.daily_rate === '') {
      setForm((current) => ({ ...current, daily_rate: String(selectedCar.daily_rate) }))
    }
  }, [selectedCar, form.daily_rate, isEdit])

  // Use the fleet's mileage allowance as the default for this booking.
  useEffect(() => {
    const limit = Number(selectedCar?.daily_mileage_limit) || 0
    if (selectedCar && limit > 0 && form.expected_km_per_day === '') {
      setForm((current) =>
        current.expected_km_per_day === ''
          ? { ...current, expected_km_per_day: String(limit) }
          : current,
      )
    }
  }, [selectedCar, form.expected_km_per_day])

  const days = Math.max(0, daysBetween(form.pickup_at, form.expected_return_at))
  const rate = Number(form.daily_rate) || 0
  const expectedKmPerDay = Number(form.expected_km_per_day) || 0
  const mileageAllowance = expectedKmPerDay * days
  const excessRatePerKm = expectedKmPerDay > 0 ? rate / expectedKmPerDay : 0
  const extrasTotal = form.additional_charges.reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0)
  const rentalTotal = isEdit && existing.data ? existing.data.computed_total : rate * days + extrasTotal
  const paidSoFar = existing.data?.computed_paid || 0
  const balance = isEdit ? Math.max(0, rentalTotal - paidSoFar) : 0

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  const addCharge = () =>
    setForm((current) => ({
      ...current,
      additional_charges: [...current.additional_charges, { label: '', amount: '' }],
    }))

  const updateCharge = (index, field) => (event) =>
    setForm((current) => {
      const charges = [...current.additional_charges]
      charges[index] = { ...charges[index], [field]: event.target.value }
      return { ...current, additional_charges: charges }
    })

  const removeCharge = (index) =>
    setForm((current) => ({
      ...current,
      additional_charges: current.additional_charges.filter((_, position) => position !== index),
    }))

  const validate = () => {
    const found = {}
    if (!form.car_id) found.car_id = 'Select the vehicle being rented out.'
    if (!form.customer_id) found.customer_id = 'Select or add the customer.'
    if (!form.pickup_at) found.pickup_at = 'Pickup date and time is required.'
    if (!form.expected_return_at) found.expected_return_at = 'Expected return is required.'
    if (form.pickup_at && form.expected_return_at) {
      if (toDate(form.expected_return_at) <= toDate(form.pickup_at)) {
        found.expected_return_at = 'Return must be after pickup.'
      }
    }
    if (rate < 0) found.daily_rate = 'Daily rate cannot be negative.'
    const needsExpectedMileage = !isEdit || status === 'active' || status === 'overdue'
    if (needsExpectedMileage && !(expectedKmPerDay > 0)) {
      found.expected_km_per_day = 'Enter the expected kilometres per day for this rental.'
    }
    const needsMileage = !isEdit || status === 'active'
    if (needsMileage) {
      if (form.start_mileage === '' || Number(form.start_mileage) < 0) {
        found.start_mileage = 'Enter the vehicle mileage at pickup.'
      }
    }
    if (!isEdit && pickupPhotos.length !== 8) {
      found.pickup_photos = 'Capture all 8 vehicle handover photos before saving the rental.'
    }
    setErrors(found)
    return Object.keys(found).length === 0
  }

  const submit = async (event) => {
    event.preventDefault()
    setServerError(null)
    if (!validate()) return

    const payload = {
      car_id: form.car_id,
      customer_id: form.customer_id,
      pickup_at: new Date(form.pickup_at).toISOString(),
      expected_return_at: new Date(form.expected_return_at).toISOString(),
      daily_rate: rate,
      deposit_amount: Number(form.deposit_amount) || 0,
      start_mileage: form.start_mileage === '' ? undefined : Number(form.start_mileage),
      ...(expectedKmPerDay > 0 ? { expected_km_per_day: expectedKmPerDay } : {}),
      additional_charges: form.additional_charges
        .filter((charge) => charge.label?.trim())
        .map((charge) => ({ label: charge.label.trim(), amount: Number(charge.amount) || 0 })),
      notes: form.notes,
      ...(!isEdit ? { pickup_photos: pickupPhotos } : {}),
    }

    setBusy(true)
    try {
      if (isEdit) {
        await repository.rentals.update(
          id,
          { ...payload, total_amount: rate * days, status },
          user,
        )
        toast.success(`Rental ${existing.data?.reference} updated.`)
        navigate(`/app/rentals/${id}`)
      } else {
        const created = await repository.rentals.create(
          {
            ...payload,
            total_amount: rate * days,
            amount_paid: rentalTotal,
            payment_method: form.payment_method,
            created_by: user?.id,
          },
          user,
        )
        toast.success(`Rental ${created.reference} captured.`)
        navigate(`/app/rentals/${created.id}`)
      }
    } catch (cause) {
      setServerError(cause.message)
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const createCustomer = async (values) => {
    const created = await repository.customers.create({ ...values, company_id: companyId }, user)
    setForm((current) => ({ ...current, customer_id: created.id }))
    setCustomerModalOpen(false)
    toast.success(`${created.full_name} added to customers.`)
  }

  if (cars.loading || existing.loading) return <Spinner label="Preparing form…" />

  const availableCars = (isEdit ? allCars.data || [] : cars.data || []).filter(
    (car) => car.id === form.car_id || car.status === 'available',
  )

  return (
    <>
      <PageHeader
        breadcrumbs={
          <button
            type="button"
            onClick={() => navigate('/app/rentals')}
            className="hover:text-ink-700"
          >
            ← Rentals
          </button>
        }
        title={isEdit ? `Edit rental ${existing.data?.reference || ''}` : 'Capture a new rental'}
        description={
          isEdit
            ? 'Adjust the booking details. Changes are recorded in the activity log.'
            : 'Record the booking, the customer handover and the payment taken.'
        }
        actions={
          <Button variant="secondary" onClick={() => navigate(isEdit ? `/app/rentals/${id}` : '/app/rentals')}>
            Cancel
          </Button>
        }
      />

      {serverError && (
        <Alert tone="danger" icon={AlertTriangle} title="Could not save the rental" className="mb-4">
          {serverError}
        </Alert>
      )}

      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Vehicle */}
          <Card>
            <CardHeader title="Vehicle" icon={Car} description="Only available vehicles are listed." />
            <div className="space-y-3 p-5">
              <Field label="Vehicle to rent" required error={errors.car_id}>
                <Select
                  value={form.car_id}
                  onChange={set('car_id')}
                  invalid={Boolean(errors.car_id)}
                >
                  <option value="">Select a vehicle…</option>
                  {availableCars.map((car) => (
                    <option key={car.id} value={car.id} disabled={car.status !== 'available' && car.id !== form.car_id}>
                      {car.registration} — {car.make} {car.model} ({car.year}) ·{' '}
                      {currencySymbol(currency)}
                      {car.daily_rate}/day{car.status !== 'available' ? ` — ${car.status}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>

              {cars.error ? (
                <Alert tone="danger" title="Could not load vehicles">
                  {cars.error.message}
                </Alert>
              ) : selectedCar ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-ink-50 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-800">
                      {selectedCar.make} {selectedCar.model}
                    </p>
                    <p className="text-xs text-ink-500">
                      {selectedCar.registration} · {selectedCar.color || 'Colour n/a'} ·{' '}
                      {titleCase(selectedCar.category)} · {selectedCar.year} ·{' '}
                      {formatNumber(selectedCar.mileage || 0)} km on the odometer
                    </p>
                  </div>
                  <CarStatusBadge status={selectedCar.status} size="sm" />
                  <p className="text-sm font-semibold text-ink-900 tabular-nums">
                    {formatMoney(selectedCar.daily_rate, currency)}
                    <span className="text-xs font-normal text-ink-400">/day</span>
                  </p>
                </div>
              ) : (
                <Alert tone="info" icon={Info}>
                  {cars.data?.length
                    ? 'Pick a vehicle to see its details and daily rate.'
                    : 'No vehicles are currently available. Mark a vehicle as available in the fleet first.'}
                </Alert>
              )}

              {selectedCar && (!isEdit || status === 'active') && (
                <Field
                  label="Odometer at pickup (km)"
                  required
                  error={errors.start_mileage}
                  hint={
                    selectedCar.mileage != null
                      ? `The vehicle currently shows ${formatNumber(selectedCar.mileage || 0)} km.`
                      : 'Recorded at handover; used to calculate the distance covered.'
                  }
                >
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={form.start_mileage}
                    onChange={set('start_mileage')}
                    placeholder="e.g. 45210"
                    invalid={Boolean(errors.start_mileage)}
                  />
                </Field>
              )}

              {selectedCar && (
                <Field
                  label="Expected kilometres per day (km)"
                  required
                  error={errors.expected_km_per_day}
                  hint={`Allowance: ${formatNumber(mileageAllowance)} km over ${days} day${
                    days === 1 ? '' : 's'
                  }. Extra km are charged at ${formatMoney(excessRatePerKm, currency)}/km, based on the daily rate.`}
                >
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={form.expected_km_per_day}
                    onChange={set('expected_km_per_day')}
                    placeholder="e.g. 700"
                    invalid={Boolean(errors.expected_km_per_day)}
                  />
                </Field>
              )}
            </div>
          </Card>

          {/* Handover photos */}
          <Card>
            <CardHeader
              title="Handover photos"
              icon={Camera}
              description="Eight fixed-angle photos are required before the vehicle can leave. They become the baseline for the AI damage check at return."
            />
            <div className="p-5">
              {!isEdit ? (
                <>
                  <PhotoCapture
                    photos={pickupPhotos}
                    onChange={(photos) => {
                      setPickupPhotos(photos)
                      setErrors((current) => {
                        if (!current.pickup_photos) return current
                        const next = { ...current }
                        delete next.pickup_photos
                        return next
                      })
                    }}
                    disabled={busy}
                    accent="pickup"
                  />
                  {errors.pickup_photos && (
                    <p className="mt-2 text-xs font-medium text-red-600">{errors.pickup_photos}</p>
                  )}
                </>
              ) : (existingPhotos.data || []).length ? (
                <PhotoCapture
                  photos={(existingPhotos.data || []).filter((photo) => photo.phase === 'pickup')}
                  onChange={() => {}}
                  disabled
                  accent="pickup"
                  description="Pickup photos are locked once the rental is captured."
                />
              ) : (
                <Alert tone="warning" icon={AlertTriangle}>
                  This rental was captured before photo inspections were enabled, so there is no
                  pickup baseline to compare against.
                </Alert>
              )}
            </div>
          </Card>

          {/* Customer */}
          <Card>
            <CardHeader
              title="Customer"
              icon={Users}
              description="Search existing records, or add a new customer inline."
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCustomerModalOpen(true)}
                  type="button"
                >
                  <UserPlus size={14} />
                  New customer
                </Button>
              }
            />
            <div className="space-y-3 p-5">
              <Field label="Customer" required error={errors.customer_id}>
                <Select
                  value={form.customer_id}
                  onChange={set('customer_id')}
                  invalid={Boolean(errors.customer_id)}
                >
                  <option value="">Select a customer…</option>
                  {(customers.data || []).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.full_name}
                      {customer.phone ? ` — ${customer.phone}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>

              {customers.data?.length > 6 && (
                <Field label="Search customers" hint="Filters the list above by name, phone or ID.">
                  <Input
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder="Type to search…"
                  />
                </Field>
              )}

              {selectedCustomer && (
                <dl className="grid gap-x-4 gap-y-2 rounded-lg bg-ink-50 px-4 py-3 text-sm sm:grid-cols-2">
                  {[
                    ['Phone', selectedCustomer.phone],
                    ['Email', selectedCustomer.email],
                    ['ID / Passport', selectedCustomer.id_number],
                    ['Licence', selectedCustomer.driver_license],
                    ['Previous rentals', selectedCustomer.rentals ?? 0],
                    ['Lifetime spend', formatMoney(selectedCustomer.spend || 0, currency)],
                  ]
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-3">
                        <dt className="text-ink-500">{label}</dt>
                        <dd className="truncate font-medium text-ink-800">{value}</dd>
                      </div>
                    ))}
                  {!selectedCustomer.driver_license && (
                    <div className="sm:col-span-2">
                      <Alert tone="warning" icon={AlertTriangle}>
                        This customer has no driver&apos;s licence on file. Verify before handover.
                      </Alert>
                    </div>
                  )}
                </dl>
              )}
            </div>
          </Card>

          {/* Charges */}
          <Card>
            <CardHeader
              title="Charges & payment"
              icon={Plus}
              description="Amounts are calculated automatically from the daily rate and duration."
            />
            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Daily rate" hint={`Default from the vehicle record.`}>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.daily_rate}
                    onChange={set('daily_rate')}
                  />
                </Field>
                <Field label="Deposit / security amount" hint="Refunded on clean return.">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.deposit_amount}
                    onChange={set('deposit_amount')}
                    placeholder="0.00"
                  />
                </Field>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="field-label mb-0">Additional charges</span>
                  <Button variant="ghost" size="sm" onClick={addCharge} type="button">
                    <Plus size={14} />
                    Add charge
                  </Button>
                </div>
                {form.additional_charges.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-ink-300 px-3 py-3 text-xs text-ink-400">
                    Late return, damage, fuel or toll charges can be added here or when the car is
                    returned.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {form.additional_charges.map((charge, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          placeholder="Charge description (e.g. damage fee)"
                          value={charge.label}
                          onChange={updateCharge(index, 'label')}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={charge.amount}
                          onChange={updateCharge(index, 'amount')}
                          className="w-32"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCharge(index)}
                          aria-label="Remove charge"
                          type="button"
                        >
                          <Minus size={15} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!isEdit && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Payment recorded"
                    hint="The full rental total is recorded as paid when you capture this rental."
                  >
                    <Input
                      type="number"
                      value={rentalTotal.toFixed(2)}
                      readOnly
                    />
                  </Field>
                  <Field label="Payment method">
                    <Select value={form.payment_method} onChange={set('payment_method')}>
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {titleCase(method)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}

              {isEdit && (
                <Field label="Rental status">
                  <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </Select>
                </Field>
              )}

              <Field label="Notes / remarks">
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={set('notes')}
                  placeholder="Airport pickup, flight number, special instructions…"
                />
              </Field>
            </div>
          </Card>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader title="Summary" />
            <div className="p-5">
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <Field label="Pickup date & time" required error={errors.pickup_at}>
                  <Input
                    type="datetime-local"
                    value={form.pickup_at}
                    onChange={set('pickup_at')}
                    invalid={Boolean(errors.pickup_at)}
                  />
                </Field>
                <Field label="Expected return" required error={errors.expected_return_at}>
                  <Input
                    type="datetime-local"
                    value={form.expected_return_at}
                    onChange={set('expected_return_at')}
                    invalid={Boolean(errors.expected_return_at)}
                  />
                </Field>
                <Field label="Rental days" hint="Calculated from the period above.">
                  <Input type="number" value={days} readOnly disabled />
                </Field>
              </dl>

              <dl className="mt-5 space-y-2 border-t border-ink-100 pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-500">
                    {currencySymbol(currency)}
                    {rate.toFixed(2)} × {days} day{days === 1 ? '' : 's'}
                  </dt>
                  <dd className="font-medium text-ink-800 tabular-nums">
                    {formatMoney(rate * days, currency)}
                  </dd>
                </div>
                {extrasTotal > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Additional charges</dt>
                    <dd className="font-medium text-ink-800 tabular-nums">
                      {formatMoney(extrasTotal, currency)}
                    </dd>
                  </div>
                )}
                {expectedKmPerDay > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-500">
                      Mileage allowance ({formatNumber(expectedKmPerDay)} km/day)
                    </dt>
                    <dd className="font-medium text-ink-800 tabular-nums">
                      {formatNumber(mileageAllowance)} km
                    </dd>
                  </div>
                )}
                {isEdit && paidSoFar > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Already paid</dt>
                    <dd className="font-medium text-emerald-700 tabular-nums">
                      −{formatMoney(paidSoFar, currency)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-ink-100 pt-2 text-base">
                  <dt className="font-semibold text-ink-800">Total</dt>
                  <dd className="font-semibold text-ink-900 tabular-nums">
                    {formatMoney(rentalTotal, currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Balance after payment</dt>
                  <dd
                    className={`font-semibold tabular-nums ${
                      balance > 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}
                  >
                    {balance > 0 ? formatMoney(balance, currency) : 'Settled'}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 space-y-2">
                <Button type="submit" className="w-full" size="lg" loading={busy}>
                  {isEdit ? (
                    <>
                      <Save size={16} />
                      Save changes
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Capture rental
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  type="button"
                  onClick={() => navigate('/app/rentals')}
                >
                  Save and exit
                </Button>
              </div>

              {!isEdit && (
                <p className="mt-4 flex gap-2 text-xs leading-relaxed text-ink-400">
                  <Trash2 size={14} className="mt-0.5 shrink-0" />
                  Capturing a rental immediately marks the vehicle as rented and logs the booking
                  against your name.
                </p>
              )}
            </div>
          </Card>
        </div>
      </form>

      <CustomerFormModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        onSubmit={createCustomer}
        title="Add customer"
      />
    </>
  )
}