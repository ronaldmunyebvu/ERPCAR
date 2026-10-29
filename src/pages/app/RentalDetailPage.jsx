import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Camera,
  Car,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Printer,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  Wallet,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRepository, useResource, useOverdueTicker } from '@/hooks/useRepository'
import { useToast } from '@/context/ToastContext'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  TableWrapper,
  Textarea,
} from '@/components/ui'
import { RentalStatusBadge, PaymentMethodBadge, CarStatusBadge } from '@/components/domain/Badges'
import { PhotoCapture } from '@/components/domain/PhotoCapture'
import {
  PHOTO_SLOTS,
  compareInspectionPhotos,
} from '@/lib/vehicleInspection'
import {
  formatMoney,
  formatDate,
  formatDateTime,
  formatNumber,
  daysBetween,
  excessMileageInfo,
  excessMileageCharge,
  currencySymbol,
  toDateTimeInput,
  toDate,
  PAYMENT_METHODS,
  titleCase,
} from '@/lib/utils'

export default function RentalDetailPage() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, company, isAdmin } = useAuth()
  const { repository } = useRepository()
  useOverdueTicker()

  const companyId = company?.id
  const currency = company?.currency || 'USD'
  const money = (value) => formatMoney(value, currency)

  const [returnOpen, setReturnOpen] = useState(searchParams.get('action') === 'return')
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [viewerPhoto, setViewerPhoto] = useState(null)

  const rental = useResource(
    () => repository.rentals.get(id, { companyId }),
    `rental|${Boolean(repository)}|${id}|${companyId}`,
  )

  const data = rental.data
  const photos = useResource(
    () => repository.rentals.photos(id, { companyId }),
    `rentalphotos|${Boolean(repository)}|${id}|${companyId}|${data?.updated_at || ''}`,
  )

  const pickupPhotos = useMemo(
    () => (photos.data || []).filter((photo) => photo.phase === 'pickup'),
    [photos.data],
  )
  const returnPhotos = useMemo(
    () => (photos.data || []).filter((photo) => photo.phase === 'return'),
    [photos.data],
  )

  const canEdit = isAdmin || (company?.members_edit_own_rentals && data?.created_by === user?.id)
  const open = data && (data.status === 'active' || data.computed_status === 'overdue')

  useEffect(() => {
    if (searchParams.get('action') === 'return' && data && !open) {
      setSearchParams(new URLSearchParams(), { replace: true })
    }
  }, [data, open, searchParams, setSearchParams])

  const lateDays = useMemo(() => {
    if (!data?.actual_return_at) return 0
    return Math.max(0, daysBetween(data.expected_return_at, data.actual_return_at) - 1)
  }, [data])

  const mileage = useMemo(() => excessMileageInfo(data), [data])
  const mileageCharge = excessMileageCharge(mileage)

  if (rental.loading) return <Spinner label="Loading rental…" />
  if (rental.error || !data) {
    return (
      <Alert tone="danger" title="Rental not found" icon={AlertTriangle}>
        {rental.error?.message || 'This rental does not exist, or it belongs to another company.'}
      </Alert>
    )
  }

  const closeReturnModal = () => {
    setReturnOpen(false)
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  const confirmDelete = async () => {
    setBusy(true)
    try {
      await repository.rentals.remove(id, user)
      toast.success(`Rental ${data.reference} deleted.`)
      navigate('/app/rentals')
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
      setDeleteOpen(false)
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={
          <button type="button" onClick={() => navigate('/app/rentals')} className="hover:text-ink-700">
            ← Rentals
          </button>
        }
        title={data.reference}
        description={`${data.car?.make} ${data.car?.model} · ${data.car?.registration} · booked by ${data.created_by_user?.full_name || 'unknown'}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={15} />
              Print
            </Button>
            {canEdit && (
              <Button variant="secondary" onClick={() => navigate(`/app/rentals/${id}/edit`)}>
                <Pencil size={15} />
                Edit
              </Button>
            )}
            {open && canEdit && (
              <Button onClick={() => setReturnOpen(true)}>
                <CheckCircle2 size={15} />
                Record return
              </Button>
            )}
          </>
        }
      />

      {data.computed_status === 'overdue' && (
        <Alert
          tone="danger"
          icon={AlertTriangle}
          title="This rental is overdue"
          className="mb-4"
        >
          It was due back on {formatDateTime(data.expected_return_at)} (
          {daysBetween(data.expected_return_at, new Date())} day(s) ago) and has not been returned.
          Follow up with the customer.
        </Alert>
      )}

      {data.damage_report?.damage_detected && (
        <Alert
          tone="danger"
          icon={ShieldAlert}
          title="AI detected possible new damage on return"
          className="mb-4"
        >
          {data.damage_report.summary}{' '}
          <a href="#inspection" className="font-semibold underline">
            Review the highlighted photos
          </a>
          .
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Rental summary"
              icon={FileText}
              actions={<RentalStatusBadge status={data.computed_status} />}
            />
            <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
              <Detail label="Pickup" value={formatDateTime(data.pickup_at)} />
              <Detail label="Expected return" value={formatDateTime(data.expected_return_at)} />
              <Detail label="Actual return" value={data.actual_return_at ? formatDateTime(data.actual_return_at) : 'Not returned'} />
              <Detail label="Duration" value={`${data.days} day${data.days === 1 ? '' : 's'}`} />
              <Detail label="Daily rate" value={money(data.daily_rate)} />
              <Detail label="Rental fee" value={money(data.daily_rate * data.days)} />
              {lateDays > 0 && (
                <Detail label="Days late" value={`${lateDays} day${lateDays === 1 ? '' : 's'}`} tone="danger" />
              )}
              <Detail label="Deposit held" value={money(data.deposit_amount)} />
              {data.start_mileage != null && (
                <Detail
                  label="Odometer at pickup"
                  value={`${formatNumber(data.start_mileage)} km`}
                />
              )}
              {data.start_mileage != null && data.end_mileage != null && (
                <Detail
                  label="Distance covered"
                  value={`${formatNumber(Math.max(0, data.end_mileage - data.start_mileage))} km`}
                />
              )}
              {data.expected_km_per_day != null && (
                <Detail
                  label="Mileage allowance"
                  value={`${formatNumber(data.expected_km_per_day)} km/day · ${formatNumber(
                    Number(data.expected_km_per_day) * data.days,
                  )} km total`}
                />
              )}
              {mileage && (
                <Detail
                  label="Excess mileage"
                  value={
                    mileage.exceeded
                      ? `${formatNumber(mileage.excess_km)} km over allowance`
                      : 'Within allowance'
                  }
                  tone={mileage.exceeded ? 'danger' : undefined}
                />
              )}
              {mileageCharge && (
                <Detail
                  label="Excess mileage charge"
                  value={money(mileageCharge.amount)}
                  tone="danger"
                />
              )}
              <Detail
                label="Captured by"
                value={`${data.created_by_user?.full_name || '—'}`}
                subvalue={data.created_by_user?.email}
              />
              <Detail label="Booked on" value={formatDate(data.created_at)} />
            </div>
            {data.notes && (
              <div className="border-t border-ink-100 px-5 py-4">
                <p className="text-xs font-semibold tracking-wide text-ink-400 uppercase">Notes</p>
                <p className="mt-1 text-sm whitespace-pre-line text-ink-700">{data.notes}</p>
              </div>
            )}
          </Card>

          <Card id="inspection">
            <CardHeader
              title="Inspection photos"
              icon={Camera}
              description="Eight fixed angles at pickup and eight at return. The return set is compared with the pickup set automatically."
              actions={
                <Badge tone={pickupPhotos.length === 8 ? 'success' : 'warning'} size="sm">
                  Pickup {pickupPhotos.length}/8 · Return {returnPhotos.length}/8
                </Badge>
              }
            />
            <div className="space-y-5 p-5">
              {photos.loading ? (
                <Spinner label="Loading inspection photos…" />
              ) : photos.error ? (
                <Alert tone="danger" title="Could not load inspection photos">
                  {photos.error.message}
                </Alert>
              ) : !photos.data?.length ? (
                <p className="rounded-lg border border-dashed border-ink-300 px-3 py-4 text-center text-sm text-ink-400">
                  No inspection photos are on file for this rental.
                </p>
              ) : (
                <>
                  <PhotoSet title="Photos at pickup" photos={pickupPhotos} onOpen={setViewerPhoto} />
                  <PhotoSet
                    title="Photos on return"
                    photos={returnPhotos}
                    report={data.damage_report}
                    onOpen={setViewerPhoto}
                  />
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="AI damage check"
              icon={ScanLine}
              description="Compares each return photo with the matching pickup angle."
              actions={
                data.damage_report ? (
                  <Badge tone={data.damage_report.damage_detected ? 'danger' : 'success'} size="sm">
                    {data.damage_report.damage_detected ? 'Attention needed' : 'No new damage'}
                  </Badge>
                ) : null
              }
            />
            <div className="p-5">
              {data.damage_report ? (
                <DamageReportPanel
                  report={data.damage_report}
                  onOpen={(slot) => {
                    const photo = returnPhotos.find((item) => item.slot === slot)
                    const view = data.damage_report.views?.find((item) => item.slot === slot)
                    if (photo) setViewerPhoto({ photo, regions: view?.regions || [] })
                  }}
                />
              ) : (
                <p className="text-sm text-ink-500">
                  {data.actual_return_at
                    ? 'No photo comparison was recorded when this rental was closed.'
                    : 'A comparison report is produced automatically when the car is returned.'}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Billing" icon={CircleDollarSign} />
            <div className="p-5">
              <dl className="space-y-2 text-sm">
                <Row label={`Rental fee (${data.daily_rate ? currencySymbol(currency) : ''}${data.daily_rate} × ${data.days} days)`} value={money(data.daily_rate * data.days)} />
                {(data.additional_charges || []).map((charge, index) => (
                  <Row
                    key={index}
                    label={charge.label}
                    value={money(charge.amount)}
                  />
                ))}
                <Row label="Total billed" value={money(data.computed_total)} strong />
                <Row label="Total paid" value={money(data.computed_paid)} tone="success" />
                <Row
                  label="Outstanding balance"
                  value={data.computed_balance > 0 ? money(data.computed_balance) : 'Settled'}
                  strong
                  tone={data.computed_balance > 0 ? 'danger' : 'success'}
                />
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                {!open && (
                  <Button variant="secondary" size="sm" onClick={() => setPaymentOpen(true)}>
                    <Wallet size={14} />
                    Record payment
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Payment history" icon={Wallet} />
            {(data.payments || []).length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-ink-400">No payments recorded yet.</p>
            ) : (
              <TableWrapper>
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Taken by</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatDateTime(payment.received_at)}</td>
                      <td>
                        <PaymentMethodBadge method={payment.method} />
                      </td>
                      <td className="font-mono text-xs text-ink-500">{payment.reference || '—'}</td>
                      <td className="text-ink-600">{payment.received_by_user?.full_name || '—'}</td>
                      <td className="text-right font-medium text-ink-800 tabular-nums">
                        {money(payment.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrapper>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Customer" icon={User} />
            <div className="space-y-2 p-5 text-sm">
              <p className="text-base font-semibold text-ink-900">{data.customer?.full_name}</p>
              {data.customer?.phone && (
                <a
                  href={`tel:${data.customer.phone}`}
                  className="flex items-center gap-2 text-brand-600 hover:underline"
                >
                  <Phone size={14} />
                  {data.customer.phone}
                </a>
              )}
              {data.customer?.email && (
                <a
                  href={`mailto:${data.customer.email}`}
                  className="flex items-center gap-2 break-all text-brand-600 hover:underline"
                >
                  <Mail size={14} />
                  {data.customer.email}
                </a>
              )}
              {data.customer?.address && (
                <p className="flex items-start gap-2 text-ink-600">
                  <MapPin size={14} className="mt-0.5 shrink-0" />
                  {data.customer.address}
                </p>
              )}
              <dl className="mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-xs">
                <MiniRow label="ID / Passport" value={data.customer?.id_number} />
                <MiniRow label="Driver's licence" value={data.customer?.driver_license} />
              </dl>
              {data.customer && (
                <Link
                  to={`/app/customers?focus=${data.customer.id}`}
                  className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
                >
                  View rental history →
                </Link>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Vehicle" icon={Car} />
            <div className="space-y-3 p-5">
              <div>
                <p className="text-base font-semibold text-ink-900">
                  {data.car?.make} {data.car?.model}
                </p>
                <p className="font-mono text-sm text-ink-500">{data.car?.registration}</p>
              </div>
              <CarStatusBadge status={data.car?.status} />
              <dl className="grid grid-cols-2 gap-y-1.5 border-t border-ink-100 pt-3 text-xs">
                <MiniRow label="Year" value={data.car?.year} />
                <MiniRow label="Colour" value={data.car?.color} />
                <MiniRow label="Category" value={titleCase(data.car?.category)} />
                <MiniRow label="Daily rate" value={money(data.car?.daily_rate)} />
                <MiniRow
                  label="Included km/day"
                  value={
                    data.car?.daily_mileage_limit
                      ? `${formatNumber(data.car.daily_mileage_limit)} km`
                      : null
                  }
                />
              </dl>
              <Link
                to="/app/fleet"
                className="inline-block text-sm font-medium text-brand-600 hover:underline"
              >
                Open fleet →
              </Link>
            </div>
          </Card>

          {isAdmin && (
            <Card className="border-red-200">
              <CardHeader title="Danger zone" icon={AlertTriangle} />
              <div className="space-y-2 p-5">
                {open && (
                  <Button variant="secondary" className="w-full" onClick={() => setCancelOpen(true)}>
                    <Ban size={15} />
                    Cancel rental
                  </Button>
                )}
                <Button variant="danger" className="w-full" onClick={() => setDeleteOpen(true)}>
                  <Trash2 size={15} />
                  Delete permanently
                </Button>
                <p className="text-xs text-ink-400">
                  Cancelling keeps the record but frees the vehicle and marks it cancelled.
                  Deleting removes the rental and its payments.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <ReturnModal
        open={returnOpen}
        onClose={closeReturnModal}
        rental={data}
        currency={currency}
        pickupPhotos={pickupPhotos}
        onSubmit={async (payload) => {
          const updated = await repository.rentals.returnCar(id, payload, user)
          toast.success(`Rental ${data.reference} closed. Balance ${money(updated.computed_balance)}.`)
          rental.reload()
          photos.reload()
        }}
      />

      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        rental={data}
        currency={currency}
        onSubmit={async (payload) => {
          await repository.payments.create({ company_id: companyId, rental_id: id, ...payload }, user)
          toast.success('Payment recorded.')
          setPaymentOpen(false)
          rental.reload()
        }}
      />

      <CancelModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onSubmit={async (reason) => {
          await repository.rentals.cancel(id, reason, user)
          toast.success(`Rental ${data.reference} cancelled.`)
          setCancelOpen(false)
          rental.reload()
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        loading={busy}
        title="Delete this rental?"
        confirmLabel="Delete permanently"
        message={`Rental ${data.reference} and its payment records will be removed. This cannot be undone — cancelling is usually safer.`}
      />

      <Modal
        open={Boolean(viewerPhoto)}
        onClose={() => setViewerPhoto(null)}
        title={
          viewerPhoto?.photo
            ? `${viewerPhoto.photo.label || 'Inspection photo'} · ${
                viewerPhoto.photo.phase === 'return' ? 'Return' : 'Pickup'
              }`
            : 'Inspection photo'
        }
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setViewerPhoto(null)}>
            Close
          </Button>
        }
      >
        {viewerPhoto?.photo && (
          <PhotoWithOverlays photo={viewerPhoto.photo} regions={viewerPhoto.regions || []} />
        )}
      </Modal>
    </>
  )
}

function ReturnModal({ open, onClose, rental, currency, pickupPhotos = [], onSubmit }) {
  const defaultReturn = rental.actual_return_at ? toDateTimeInput(rental.actual_return_at) : toDateTimeInput(new Date())
  const [values, setValues] = useState({ actual_return_at: defaultReturn, end_mileage: '', notes: rental.notes || '', charges: rental.additional_charges || [] })
  const [returnPhotos, setReturnPhotos] = useState([])
  const [report, setReport] = useState(null)
  const [analysing, setAnalysing] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const baselineComplete = pickupPhotos.length === 8

  useEffect(() => {
    if (open) {
      setValues({
        actual_return_at: toDateTimeInput(new Date()),
        end_mileage: '',
        notes: rental.notes || '',
        charges: (rental.additional_charges || []).map((charge) => ({ ...charge })),
      })
      setReturnPhotos([])
      setReport(null)
      setAcknowledged(false)
      setError(null)
    }
  }, [open, rental])

  const days = Math.max(1, daysBetween(rental.pickup_at, values.actual_return_at))
  const expectedPerDay = Number(rental.expected_km_per_day) || 0
  const allowanceKm = expectedPerDay > 0 ? expectedPerDay * days : null
  const lateDays = Math.max(0, daysBetween(rental.expected_return_at, values.actual_return_at) - 1)
  const autoLateFee =
    lateDays > 0 && !values.charges.some((charge) => /late/i.test(charge.label || ''))
      ? Math.round(rental.daily_rate * 0.5 * lateDays)
      : 0
  const endMileage = values.end_mileage === '' ? null : Number(values.end_mileage)
  const mileage = excessMileageInfo({ ...rental, end_mileage: endMileage }, days)
  const mileageCharge = excessMileageCharge(mileage)
  const hasMileageCharge = values.charges.some((charge) =>
    /(excess|mileage)/i.test(charge.label || ''),
  )
  const autoMileageCharge = hasMileageCharge ? null : mileageCharge
  const extras = values.charges.reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0)
  const newTotal = rental.daily_rate * days + extras + autoLateFee + (autoMileageCharge?.amount || 0)
  const alreadyPaid = rental.computed_paid
  const balance = Math.max(0, newTotal - alreadyPaid)
  const distanceCovered = mileage?.distance_km ?? null

  const runComparison = async () => {
    setError(null)
    if (returnPhotos.length !== 8) {
      setError('Capture all 8 return inspection photos before running the damage check.')
      return null
    }
    if (!baselineComplete) {
      setError('There are no pickup photos on file to compare against.')
      return null
    }
    setAnalysing(true)
    try {
      const result = await compareInspectionPhotos(rental.id, returnPhotos)
      setReport(result)
      setAcknowledged(false)
      return result
    } catch (cause) {
      setError(cause.message)
      return null
    } finally {
      setAnalysing(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    if (toDate(values.actual_return_at) < toDate(rental.pickup_at)) {
      setError('Return time cannot be before the pickup time.')
      return
    }
    if (endMileage == null || Number.isNaN(endMileage) || endMileage < 0) {
      setError('Enter the vehicle mileage at return.')
      return
    }
    if (rental.start_mileage != null && endMileage < Number(rental.start_mileage)) {
      setError('The return mileage cannot be less than the pickup mileage.')
      return
    }
    if (returnPhotos.length !== 8) {
      setError('Capture all 8 return inspection photos before closing the rental.')
      return
    }
    if (!baselineComplete) {
      setError('A complete set of 8 pickup inspection photos is required before this rental can be closed.')
      return
    }
    setBusy(true)
    try {
      let currentReport = report
      if (!currentReport) {
        setAnalysing(true)
        currentReport = await compareInspectionPhotos(rental.id, returnPhotos)
        setReport(currentReport)
        setAnalysing(false)
      }
      if (currentReport?.damage_detected && !acknowledged) {
        setError(
          'The AI damage check found possible new damage. Review the highlighted areas and tick the acknowledgement below before closing the rental.',
        )
        return
      }
      await onSubmit({
        actual_return_at: new Date(values.actual_return_at).toISOString(),
        end_mileage: endMileage,
        notes: values.notes,
        return_photos: returnPhotos,
        damage_report: currentReport || null,
        additional_charges: [
          ...values.charges.filter((charge) => charge.label?.trim()),
          ...(autoLateFee > 0
            ? [{ label: `Late return fee (${lateDays} day${lateDays > 1 ? 's' : ''})`, amount: autoLateFee }]
            : []),
          ...(autoMileageCharge ? [autoMileageCharge] : []),
        ],
      })
      onClose()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setAnalysing(false)
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record vehicle return"
      description="The vehicle is marked available again and the bill is recalculated."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="success" onClick={submit} loading={busy} disabled={analysing}>
            <CheckCircle2 size={15} />
            Close rental
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="danger" icon={AlertTriangle}>{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Actual return date & time" required>
            <Input
              type="datetime-local"
              value={values.actual_return_at}
              onChange={(event) => setValues({ ...values, actual_return_at: event.target.value })}
            />
          </Field>
          <Field
            label="Odometer at return (km)"
            required
            hint={
              rental.start_mileage != null
                ? `Pickup reading: ${formatNumber(rental.start_mileage)} km${
                    allowanceKm != null
                      ? ` · Allowance: ${formatNumber(allowanceKm)} km (${formatNumber(
                          expectedPerDay,
                        )} km/day × ${days} day${days === 1 ? '' : 's'})`
                      : ''
                  }${
                    distanceCovered != null && distanceCovered >= 0
                      ? ` · Distance: ${formatNumber(distanceCovered)} km`
                      : ''
                  }`
                : 'Recorded at handover.'
            }
          >
            <Input
              type="number"
              min="0"
              step="1"
              value={values.end_mileage}
              onChange={(event) => setValues({ ...values, end_mileage: event.target.value })}
              placeholder="e.g. 45890"
            />
          </Field>
        </div>

        {mileage?.exceeded && (
          <Alert tone={autoMileageCharge ? 'warning' : 'info'} icon={AlertTriangle}>
            The customer covered <strong>{formatNumber(mileage.distance_km)} km</strong> against an
            allowance of <strong>{formatNumber(mileage.allowance_km)} km</strong> (
            {formatNumber(expectedPerDay)} km/day × {days} day{days === 1 ? '' : 's'}).{' '}
            <strong>{formatNumber(mileage.excess_km)} km</strong> over the limit.
            {autoMileageCharge ? (
              <>
                {' '}An excess mileage charge of{' '}
                <strong>{formatMoney(autoMileageCharge.amount, currency)}</strong> will be added
                automatically.
              </>
            ) : (
              ' An excess mileage charge is already listed below.'
            )}
          </Alert>
        )}

        {lateDays > 0 && (
          <Alert tone="warning" icon={AlertTriangle}>
            {lateDays} day(s) late. A late return fee of{' '}
            <strong>{formatMoney(autoLateFee || Math.round(rental.daily_rate * 0.5 * lateDays), currency)}</strong>{' '}
            will be added automatically unless you already have a late charge listed below.
          </Alert>
        )}

        <div className="rounded-xl border border-ink-200 p-3">
          <PhotoCapture
            photos={returnPhotos}
            onChange={(next) => {
              setReturnPhotos(next)
              setReport(null)
              setAcknowledged(false)
            }}
            disabled={busy || analysing}
            accent="return"
            title="Return inspection photos"
            description="Capture the same 8 angles as the pickup inspection. The AI damage check runs against these photos."
          />
        </div>

        {!baselineComplete && (
          <Alert tone="warning" icon={AlertTriangle}>
            No complete pickup inspection is on file. The rental cannot be closed until all 8 pickup
            photos are available for comparison with the return photos.
          </Alert>
        )}

        {baselineComplete && (
          <div className="rounded-xl border border-ink-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-start gap-2">
                <ScanLine size={17} className="mt-0.5 shrink-0 text-brand-600" />
                <div>
                  <p className="text-sm font-semibold text-ink-800">AI damage check</p>
                  <p className="text-xs text-ink-500">
                    Compares each return photo with the matching pickup angle.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={runComparison}
                loading={analysing}
                disabled={busy || returnPhotos.length !== 8}
              >
                <ScanLine size={14} />
                {report ? 'Re-run comparison' : 'Run comparison'}
              </Button>
            </div>

            {report && (
              <div className="mt-3 space-y-3">
                <Alert
                  tone={report.damage_detected ? 'danger' : 'success'}
                  icon={report.damage_detected ? ShieldAlert : ShieldCheck}
                  title={report.damage_detected ? 'Possible damage detected' : 'No new damage detected'}
                >
                  {report.summary}
                </Alert>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  {report.views.map((view) => (
                    <div key={view.slot}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="truncate text-ink-600">{view.label}</span>
                        <span
                          className={
                            view.damage_detected
                              ? 'font-semibold text-red-600'
                              : 'font-semibold text-emerald-600'
                          }
                        >
                          {view.status === 'compared' ? `${view.score}%` : '—'}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                        <div
                          className={view.damage_detected ? 'h-full bg-red-500' : 'h-full bg-emerald-500'}
                          style={{ width: `${view.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {report.damage_detected && (
                  <Checkbox
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    label="I have reviewed the highlighted damage"
                    description="The rental cannot be closed until this is acknowledged. Add any repair or damage charge below if the customer is responsible."
                  />
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="field-label mb-0">Charges on return</span>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() =>
                setValues((current) => ({
                  ...current,
                  charges: [...current.charges, { label: '', amount: '' }],
                }))
              }
            >
              Add charge
            </Button>
          </div>
          {values.charges.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-300 px-3 py-3 text-xs text-ink-400">
              Add damage, fuel or cleaning charges here.
            </p>
          ) : (
            <div className="space-y-2">
              {values.charges.map((charge, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={charge.label}
                    placeholder="Description"
                    onChange={(event) => {
                      const charges = [...values.charges]
                      charges[index] = { ...charges[index], label: event.target.value }
                      setValues({ ...values, charges })
                    }}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={charge.amount}
                    onChange={(event) => {
                      const charges = [...values.charges]
                      charges[index] = { ...charges[index], amount: event.target.value }
                      setValues({ ...values, charges })
                    }}
                    className="w-32"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    aria-label="Remove charge"
                    onClick={() =>
                      setValues({
                        ...values,
                        charges: values.charges.filter((_, position) => position !== index),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Field label="Closing notes">
          <Textarea
            rows={2}
            value={values.notes}
            onChange={(event) => setValues({ ...values, notes: event.target.value })}
            placeholder="Returned with minor scratches, full tank…"
          />
        </Field>

        <dl className="space-y-2 rounded-lg bg-ink-50 p-4 text-sm">
          {mileage && (
            <>
              <Row label="Distance covered" value={`${formatNumber(mileage.distance_km)} km`} />
              <Row
                label={`Mileage allowance (${formatNumber(expectedPerDay)} km/day × ${days} days)`}
                value={`${formatNumber(mileage.allowance_km)} km`}
              />
              {mileage.exceeded && (
                <Row
                  label="Excess mileage"
                  value={`${formatNumber(mileage.excess_km)} km`}
                  tone="danger"
                />
              )}
            </>
          )}
          {autoMileageCharge && (
            <Row
              label="Excess mileage charge"
              value={formatMoney(autoMileageCharge.amount, currency)}
              tone="danger"
            />
          )}
          <Row label={`Rental fee (${days} days)`} value={formatMoney(rental.daily_rate * days, currency)} />
          {extras > 0 && <Row label="Charges listed" value={formatMoney(extras, currency)} />}
          {autoLateFee > 0 && <Row label="Late return fee" value={formatMoney(autoLateFee, currency)} />}
          <Row label="New total" value={formatMoney(newTotal, currency)} strong />
          <Row label="Already paid" value={formatMoney(alreadyPaid, currency)} tone="success" />
          <Row
            label="Balance to collect"
            value={balance > 0 ? formatMoney(balance, currency) : 'Settled'}
            strong
            tone={balance > 0 ? 'danger' : 'success'}
          />
        </dl>
      </form>
    </Modal>
  )
}

function PhotoSet({ title, photos, report, onOpen }) {
  const bySlot = new Map(photos.map((photo) => [Number(photo.slot), photo]))
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{title}</p>
        <span
          className={`text-xs font-semibold ${photos.length === 8 ? 'text-emerald-600' : 'text-amber-600'}`}
        >
          {photos.length} of 8
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PHOTO_SLOTS.map((slot) => {
          const photo = bySlot.get(slot.slot)
          const view = report?.views?.find((item) => item.slot === slot.slot)
          if (!photo) {
            return (
              <div
                key={slot.slot}
                className="flex aspect-4/3 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink-300 bg-ink-50 px-2 text-center"
              >
                <Camera size={16} className="text-ink-300" />
                <span className="text-[11px] font-medium text-ink-500">{slot.label}</span>
                <span className="text-[10px] text-ink-400">Not captured</span>
              </div>
            )
          }
          return (
            <button
              key={slot.slot}
              type="button"
              onClick={() => onOpen?.({ photo, regions: view?.regions || [] })}
              className="group text-left"
            >
              <div className="relative overflow-hidden rounded-lg border border-ink-200">
                <img
                  src={photo.data_url}
                  alt={`${slot.label} inspection`}
                  className="aspect-4/3 w-full object-cover transition group-hover:scale-[1.02]"
                />
                <span className="absolute top-1 left-1 rounded bg-ink-950/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {slot.label}
                </span>
                {view?.damage_detected && (
                  <span className="absolute top-1 right-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {view.score}% damage
                  </span>
                )}
                {(view?.regions || []).map((region, index) => (
                  <span
                    key={index}
                    className="pointer-events-none absolute border-2 border-red-500 bg-red-500/20"
                    style={{
                      left: `${region.x * 100}%`,
                      top: `${region.y * 100}%`,
                      width: `${region.width * 100}%`,
                      height: `${region.height * 100}%`,
                    }}
                  />
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function PhotoWithOverlays({ photo, regions = [] }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <div className="relative inline-block overflow-hidden rounded-xl border border-ink-200">
          <img
            src={photo.data_url}
            alt={photo.label || 'Inspection photo'}
            className="max-h-[68vh] max-w-full object-contain"
          />
          {regions.map((region, index) => (
            <span
              key={index}
              className="pointer-events-none absolute border-2 border-red-500 bg-red-500/20 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]"
              style={{
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.width * 100}%`,
                height: `${region.height * 100}%`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="text-xs text-ink-500">
        <p>
          <span className="font-semibold text-ink-700">{photo.label}</span> · captured{' '}
          {formatDateTime(photo.captured_at)}
        </p>
        {regions.length ? (
          <p className="mt-1 font-medium text-red-600">
            Red boxes mark the areas the AI check found different from the pickup photo.
          </p>
        ) : (
          <p className="mt-1">No damage area is highlighted in this view.</p>
        )}
      </div>
    </div>
  )
}

function DamageReportPanel({ report, onOpen }) {
  const views = report.views || []
  return (
    <div className="space-y-3">
      <Alert
        tone={report.damage_detected ? 'danger' : 'success'}
        icon={report.damage_detected ? ShieldAlert : ShieldCheck}
        title={report.damage_detected ? 'Possible damage detected' : 'No new damage detected'}
      >
        {report.summary}
      </Alert>

      <div className="space-y-1.5">
        {views.map((view) => (
          <button
            key={view.slot}
            type="button"
            onClick={() => onOpen?.(view.slot)}
            className="flex w-full items-center gap-3 rounded-lg border border-ink-100 px-3 py-2 text-left transition hover:bg-ink-50"
          >
            <span className="w-20 shrink-0 text-xs font-medium text-ink-600">{view.label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
              <div
                className={view.damage_detected ? 'h-full bg-red-500' : 'h-full bg-emerald-500'}
                style={{ width: `${view.score}%` }}
              />
            </div>
            <span
              className={`w-10 text-right text-xs font-semibold ${
                view.damage_detected ? 'text-red-600' : 'text-emerald-600'
              }`}
            >
              {view.status === 'compared' ? `${view.score}%` : '—'}
            </span>
            {view.damage_detected && (
              <Badge tone="danger" size="sm">
                Damage
              </Badge>
            )}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-ink-400">
        {report.engine} · {formatDateTime(report.analysed_at)}
      </p>
    </div>
  )
}

function PaymentModal({ open, onClose, rental, currency, onSubmit }) {
  const suggested = Number(((rental.computed_total - rental.computed_paid) || 0).toFixed(2))
  const [values, setValues] = useState({
    amount: String(suggested || ''),
    method: 'cash',
    reference: '',
    note: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setValues({
        amount: String(suggested || ''),
        method: 'cash',
        reference: '',
        note: '',
      })
      setError(null)
    }
  }, [open, suggested])

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    if (!(Number(values.amount) > 0)) {
      setError('Enter an amount greater than zero.')
      return
    }
    setBusy(true)
    try {
      await onSubmit(values)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a payment"
      description={`Outstanding on ${rental.reference}: ${formatMoney(suggested, currency)}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Save payment
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="danger" icon={AlertTriangle}>{error}</Alert>}
        <Field label="Amount" required>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={values.amount}
            onChange={(event) => setValues({ ...values, amount: event.target.value })}
          />
        </Field>
        <Field label="Method">
          <Select value={values.method} onChange={(event) => setValues({ ...values, method: event.target.value })}>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {titleCase(method)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference" hint="Slip, cheque or transaction number.">
          <Input
            value={values.reference}
            onChange={(event) => setValues({ ...values, reference: event.target.value })}
          />
        </Field>
        <Field label="Note">
          <Input value={values.note} onChange={(event) => setValues({ ...values, note: event.target.value })} />
        </Field>
      </form>
    </Modal>
  )
}

function CancelModal({ open, onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel this rental"
      description="The record is kept for reporting, and the vehicle is released."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep rental
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onSubmit(reason)
                setReason('')
              } finally {
                setBusy(false)
              }
            }}
          >
            Cancel rental
          </Button>
        </>
      }
    >
      <Field label="Reason" hint="Appended to the rental notes.">
        <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
    </Modal>
  )
}

function Detail({ label, value, subvalue, tone }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-ink-400 uppercase">{label}</dt>
      <dd
        className={`mt-0.5 text-sm font-medium ${
          tone === 'danger' ? 'text-red-600' : 'text-ink-800'
        }`}
      >
        {value ?? '—'}
      </dd>
      {subvalue && <dd className="text-xs text-ink-400">{subvalue}</dd>}
    </div>
  )
}

function MiniRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-400">{label}</dt>
      <dd className="truncate font-medium text-ink-700">{value}</dd>
    </div>
  )
}

function Row({ label, value, strong, tone }) {
  return (
    <div className={`flex justify-between ${strong ? 'border-t border-ink-200 pt-2' : ''}`}>
      <dt className={strong ? 'font-semibold text-ink-800' : 'text-ink-500'}>{label}</dt>
      <dd
        className={`tabular-nums ${strong ? 'text-base font-semibold' : 'font-medium'} ${
          tone === 'danger' ? 'text-red-600' : tone === 'success' ? 'text-emerald-600' : 'text-ink-800'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}