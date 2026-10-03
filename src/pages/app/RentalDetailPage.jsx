import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Car,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Printer,
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
import {
  formatMoney,
  formatDate,
  formatDateTime,
  daysBetween,
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

  const rental = useResource(
    () => repository.rentals.get(id, { companyId }),
    `rental|${Boolean(repository)}|${id}|${companyId}`,
  )

  const data = rental.data
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
        onSubmit={async (payload) => {
          const updated = await repository.rentals.returnCar(id, payload, user)
          toast.success(`Rental ${data.reference} closed. Balance ${money(updated.computed_balance)}.`)
          rental.reload()
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
    </>
  )
}

function ReturnModal({ open, onClose, rental, currency, onSubmit }) {
  const defaultReturn = rental.actual_return_at ? toDateTimeInput(rental.actual_return_at) : toDateTimeInput(new Date())
  const [values, setValues] = useState({ actual_return_at: defaultReturn, notes: rental.notes || '', charges: rental.additional_charges || [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setValues({
        actual_return_at: toDateTimeInput(new Date()),
        notes: rental.notes || '',
        charges: (rental.additional_charges || []).map((charge) => ({ ...charge })),
      })
      setError(null)
    }
  }, [open, rental])

  const days = Math.max(1, daysBetween(rental.pickup_at, values.actual_return_at))
  const lateDays = Math.max(0, daysBetween(rental.expected_return_at, values.actual_return_at) - 1)
  const autoLateFee =
    lateDays > 0 && !values.charges.some((charge) => /late/i.test(charge.label || ''))
      ? Math.round(rental.daily_rate * 0.5 * lateDays)
      : 0
  const extras = values.charges.reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0)
  const newTotal = rental.daily_rate * days + extras + autoLateFee
  const alreadyPaid = rental.computed_paid
  const balance = Math.max(0, newTotal - alreadyPaid)

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    if (toDate(values.actual_return_at) < toDate(rental.pickup_at)) {
      setError('Return time cannot be before the pickup time.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({
        actual_return_at: new Date(values.actual_return_at).toISOString(),
        notes: values.notes,
        additional_charges: [
          ...values.charges.filter((charge) => charge.label?.trim()),
          ...(autoLateFee > 0
            ? [{ label: `Late return fee (${lateDays} day${lateDays > 1 ? 's' : ''})`, amount: autoLateFee }]
            : []),
        ],
      })
      onClose()
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
      title="Record vehicle return"
      description="The vehicle is marked available again and the bill is recalculated."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="success" onClick={submit} loading={busy}>
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
          <Field label="Total days out" hint={`Daily rate ${formatMoney(rental.daily_rate, currency)}`}>
            <Input value={days} readOnly disabled />
          </Field>
        </div>

        {lateDays > 0 && (
          <Alert tone="warning" icon={AlertTriangle}>
            {lateDays} day(s) late. A late return fee of{' '}
            <strong>{formatMoney(autoLateFee || Math.round(rental.daily_rate * 0.5 * lateDays), currency)}</strong>{' '}
            will be added automatically unless you already have a late charge listed below.
          </Alert>
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