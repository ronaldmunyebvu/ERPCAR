import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Pencil, Plus, Trash2, Users, History } from 'lucide-react'
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
  Modal,
  SearchInput,
  Spinner,
  TableWrapper,
  Tabs,
} from '@/components/ui'
import { RentalStatusBadge } from '@/components/domain/Badges'
import { CustomerFields, validateCustomer } from '@/components/domain/CustomerForm'
import { formatMoney, formatDate, downloadCsv, toDateInput } from '@/lib/utils'

export default function CustomersPage() {
  const { user, company, isAdmin } = useAuth()
  const { repository } = useRepository()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const companyId = company?.id
  const currency = company?.currency || 'USD'

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 250)
  const [tab, setTab] = useState(searchParams.get('focus') ? 'history' : 'list')
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)

  const focusId = searchParams.get('focus')

  const customers = useResource(
    () => repository.customers.list({ companyId, search: debouncedSearch }),
    `customers|${companyId}|${debouncedSearch}`,
  )
  const history = useResource(
    () =>
      focusId
        ? repository.customers.history(focusId, { companyId })
        : Promise.resolve([]),
    `history|${focusId}|${companyId}`,
  )
  const focusCustomer = (customers.data || []).find((customer) => customer.id === focusId)

  const rows = customers.data || []

  const save = async (values) => {
    const found = validateCustomer(values)
    if (Object.keys(found).length > 0) throw new Error('Please correct the highlighted fields.')

    setBusy(true)
    try {
      if (editing?.id) {
        await repository.customers.update(editing.id, values, user)
        toast.success(`${values.full_name} updated.`)
      } else {
        await repository.customers.create({ ...values, company_id: companyId }, user)
        toast.success(`${values.full_name} added.`)
      }
      setEditing(null)
      customers.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await repository.customers.remove(removing.id, user)
      toast.success(`${removing.full_name} deleted.`)
      setRemoving(null)
      customers.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () =>
    downloadCsv(`customers-${toDateInput(new Date())}`, [
      { label: 'Name', value: (row) => row.full_name },
      { label: 'Phone', value: (row) => row.phone },
      { label: 'Email', value: (row) => row.email },
      { label: 'ID / Passport', value: (row) => row.id_number },
      { label: 'Licence', value: (row) => row.driver_license },
      { label: 'Rentals', value: (row) => row.rentals },
      { label: 'Lifetime spend', value: (row) => row.spend },
      { label: 'Last rental', value: (row) => row.last_rental || '' },
    ], rows)

  return (
    <>
      <PageHeader
        title="Customers"
        description="Reusable profiles so returning customers only need to be verified once."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>
              <Download size={15} />
              Export
            </Button>
            <Button onClick={() => setEditing({})}>
              <Plus size={16} />
              Add customer
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-4 py-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, phone, email or ID…"
            className="min-w-0 flex-1 sm:max-w-sm"
          />
        </div>

        <Tabs
          className="px-2"
          tabs={[
            { value: 'list', label: 'All customers', icon: Users, count: rows.length },
            { value: 'history', label: 'Rental history', icon: History, disabled: !focusId },
          ]}
          value={tab}
          onChange={setTab}
        />

        {customers.loading ? (
          <Spinner />
        ) : tab === 'history' ? (
          <CustomerHistory
            customer={focusCustomer}
            rentals={history.data || []}
            loading={history.loading}
            currency={currency}
            onClose={() => {
              const next = new URLSearchParams(searchParams)
              next.delete('focus')
              setSearchParams(next, { replace: true })
              setTab('list')
            }}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No customers found"
            message={search ? 'Try a different search term.' : 'Add your first customer to speed up bookings.'}
            action={
              <Button onClick={() => setEditing({})}>
                <Plus size={15} />
                Add customer
              </Button>
            }
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>ID / Passport</th>
                <th className="text-right">Rentals</th>
                <th className="text-right">Lifetime spend</th>
                <th>Last rental</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchParams({ focus: customer.id }, { replace: true })
                        setTab('history')
                      }}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {customer.full_name}
                    </button>
                    {customer.notes && (
                      <span className="block max-w-60 truncate text-xs text-ink-400">
                        {customer.notes}
                      </span>
                    )}
                  </td>
                  <td className="text-ink-600">
                    <div>{customer.phone || '—'}</div>
                    <div className="max-w-56 truncate text-xs text-ink-400">{customer.email}</div>
                  </td>
                  <td className="font-mono text-xs text-ink-500">{customer.id_number || '—'}</td>
                  <td className="text-right tabular-nums">{customer.rentals || 0}</td>
                  <td className="text-right font-medium tabular-nums">
                    {formatMoney(customer.spend || 0, currency)}
                  </td>
                  <td className="text-ink-600">
                    {customer.last_rental ? formatDate(customer.last_rental) : '—'}
                  </td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Link to={`/app/rentals/new?customer=${customer.id}`} title="Book for this customer">
                        <Button variant="ghost" size="sm">
                          Book
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit customer"
                        onClick={() => setEditing({ ...customer })}
                      >
                        <Pencil size={15} />
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete customer"
                          onClick={() => setRemoving(customer)}
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

      <CustomerEditor
        open={Boolean(editing)}
        customer={editing}
        busy={busy}
        onClose={() => setEditing(null)}
        onSubmit={save}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={busy}
        title={`Delete ${removing?.full_name}?`}
        confirmLabel="Delete customer"
        message="Customers with rental history cannot be deleted, so their records stay reliable."
      />
    </>
  )
}

function CustomerHistory({ customer, rentals, loading, currency, onClose }) {
  if (!customer) {
    return (
      <EmptyState
        icon={History}
        title="Select a customer"
        message="Choose a customer from the list to review their full rental history."
        action={
          <Button variant="secondary" onClick={onClose}>
            Back to list
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-ink-900">{customer.full_name}</h2>
          <p className="text-sm text-ink-500">
            {customer.phone} {customer.email ? `· ${customer.email}` : ''}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {customer.rentals || 0} rental(s) · {formatMoney(customer.spend || 0, currency)} lifetime
            spend · licence {customer.driver_license || 'not on file'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/app/rentals/new?customer=${customer.id}`}>
            <Button size="sm">
              <Plus size={14} />
              New rental
            </Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Back to list
          </Button>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : rentals.length === 0 ? (
        <EmptyState icon={History} title="No rentals recorded for this customer yet" />
      ) : (
        <TableWrapper>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Vehicle</th>
              <th>Pickup</th>
              <th>Returned</th>
              <th>Status</th>
              <th className="text-right">Total</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rentals.map((rental) => (
              <tr key={rental.id}>
                <td>
                  <Link
                    to={`/app/rentals/${rental.id}`}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {rental.reference}
                  </Link>
                </td>
                <td>
                  {rental.car?.make} {rental.car?.model}
                  <span className="block font-mono text-xs text-ink-400">{rental.car?.registration}</span>
                </td>
                <td>{formatDate(rental.pickup_at)}</td>
                <td>{rental.actual_return_at ? formatDate(rental.actual_return_at) : '—'}</td>
                <td>
                  <RentalStatusBadge status={rental.computed_status} size="sm" />
                </td>
                <td className="text-right tabular-nums">{formatMoney(rental.computed_total, currency)}</td>
                <td className="text-right tabular-nums">
                  {rental.computed_balance > 0 ? (
                    <span className="font-medium text-red-600">
                      {formatMoney(rental.computed_balance, currency)}
                    </span>
                  ) : (
                    <span className="text-emerald-600">Settled</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </div>
  )
}

function CustomerEditor({ open, customer, busy, onClose, onSubmit }) {
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [key, setKey] = useState('')

  const identity = customer?.id || (open ? 'new' : '')
  if (identity !== key) {
    setKey(identity)
    setValues({
      full_name: customer?.full_name || '',
      phone: customer?.phone || '',
      email: customer?.email || '',
      id_number: customer?.id_number || '',
      driver_license: customer?.driver_license || '',
      address: customer?.address || '',
      notes: customer?.notes || '',
    })
    setErrors({})
    setServerError(null)
  }

  const submit = async (event) => {
    event.preventDefault()
    setServerError(null)
    const found = validateCustomer(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    try {
      await onSubmit(values)
    } catch (cause) {
      setServerError(cause.message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer?.id ? `Edit ${customer.full_name}` : 'Add customer'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {customer?.id ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        {serverError && (
          <Alert tone="danger" className="mb-4">
            {serverError}
          </Alert>
        )}
        <CustomerFields values={values} errors={errors} onChange={setValues} idPrefix="customer" />
      </form>
    </Modal>
  )
}