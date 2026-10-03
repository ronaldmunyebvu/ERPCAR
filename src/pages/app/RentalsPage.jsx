import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  CalendarRange,
  Download,
  Filter,
  Plus,
  RotateCcw,
  Eye,
  Pencil,
  X,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRepository, useResource, useDebounced, useOverdueTicker } from '@/hooks/useRepository'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SearchInput,
  Select,
  Spinner,
  TableWrapper,
  Tabs,
} from '@/components/ui'
import { RentalStatusBadge } from '@/components/domain/Badges'
import {
  formatMoney,
  formatDateTime,
  toDateInput,
  downloadCsv,
  currencySymbol,
  RENTAL_STATUSES,
} from '@/lib/utils'

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function RentalsPage() {
  const { user, company, isAdmin } = useAuth()
  const { repository } = useRepository()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  useOverdueTicker()

  const status = searchParams.get('status') || 'all'
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [showFilters, setShowFilters] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [memberId, setMemberId] = useState('')
  const debouncedSearch = useDebounced(search, 250)

  const companyId = company?.id
  const seeAll = isAdmin || company?.members_see_all_rentals
  const onlyMine = !seeAll

  const rentals = useResource(
    () =>
      repository.rentals.list({
        companyId,
        status,
        search: debouncedSearch,
        from: from || undefined,
        to: to || undefined,
        createdBy: isAdmin ? (memberId || undefined) : onlyMine ? user?.id : undefined,
      }),
    `rentals|${Boolean(repository)}|${companyId}|${status}|${debouncedSearch}|${from}|${to}|${memberId}|${onlyMine}|${user?.id}`,
  )

  const members = useResource(
    () => (isAdmin ? repository.users.list({ companyId }) : Promise.resolve([])),
    `members|${Boolean(repository)}|${companyId}|${isAdmin}`,
  )

  const setStatus = (value) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete('status')
    else next.set('status', value)
    setSearchParams(next, { replace: true })
  }

  const currency = company?.currency || 'USD'
  const money = (value) => formatMoney(value, currency)

  const exportCsv = () => {
    const rows = rentals.data || []
    downloadCsv(`rentals-${toDateInput(new Date())}`, [
      { label: 'Reference', value: (row) => row.reference },
      { label: 'Status', value: (row) => row.computed_status },
      { label: 'Customer', value: (row) => row.customer?.full_name || '' },
      { label: 'Customer phone', value: (row) => row.customer?.phone || '' },
      { label: 'Vehicle', value: (row) => `${row.car?.make || ''} ${row.car?.model || ''}`.trim() },
      { label: 'Registration', value: (row) => row.car?.registration || '' },
      { label: 'Pickup', value: (row) => row.pickup_at },
      { label: 'Expected return', value: (row) => row.expected_return_at },
      { label: 'Actual return', value: (row) => row.actual_return_at || '' },
      { label: 'Days', value: (row) => row.days },
      { label: 'Daily rate', value: (row) => row.daily_rate },
      { label: 'Total', value: (row) => row.computed_total },
      { label: 'Paid', value: (row) => row.computed_paid },
      { label: 'Balance', value: (row) => row.computed_balance },
      { label: 'Deposit', value: (row) => row.deposit_amount },
      { label: 'Captured by', value: (row) => row.created_by_user?.full_name || '' },
      { label: 'Notes', value: (row) => row.notes || '' },
    ], rows)
  }

  const rows = rentals.data || []
  const hasFilters = search || from || to || memberId || status !== 'all'

  return (
    <>
      <PageHeader
        title="Rentals"
        description={
          onlyMine
            ? 'Bookings you captured. Ask your owner if you need access to the full list.'
            : 'Every booking across the fleet, with live overdue flagging.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>
              <Download size={15} />
              Export CSV
            </Button>
            <Button onClick={() => navigate('/app/rentals/new')}>
              <Plus size={16} />
              Capture rental
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-4 py-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search reference, customer, vehicle, notes…"
            className="min-w-0 flex-1 sm:max-w-sm"
          />
          <Button
            variant={showFilters ? 'subtle' : 'secondary'}
            size="sm"
            onClick={() => setShowFilters((value) => !value)}
          >
            <Filter size={14} />
            Filters
            {(from || to || memberId) > 0 && (
              <Badge tone="brand" size="sm">
                {[from, to, memberId].filter(Boolean).length}
              </Badge>
            )}
          </Button>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setFrom('')
                setTo('')
                setMemberId('')
                setStatus('all')
              }}
            >
              <RotateCcw size={14} />
              Clear
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="grid gap-3 border-b border-ink-200 bg-ink-50 px-4 py-3 sm:grid-cols-3">
            <Field label="Return on or after">
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="Picked up on or before">
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
            {isAdmin && (
              <Field label="Captured by">
                <Select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
                  <option value="">Any staff member</option>
                  {(members.data || []).map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name} ({member.role})
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        )}

        <Tabs
          className="px-2"
          tabs={STATUS_TABS.map((tab) => ({
            ...tab,
            count:
              tab.value === 'all'
                ? rows.length
                : rows.filter((row) => row.computed_status === tab.value).length,
          }))}
          value={status}
          onChange={setStatus}
        />

        {rentals.loading ? (
          <Spinner />
        ) : rentals.error ? (
          <div className="p-4">
            <Alert tone="danger" title="Could not load rentals">
              {rentals.error.message}
            </Alert>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="No rentals match these filters"
            message={
              hasFilters
                ? 'Try widening the date range or clearing the search term.'
                : 'Capture your first rental to get started.'
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('')
                    setFrom('')
                    setTo('')
                    setMemberId('')
                    setStatus('all')
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Link to="/app/rentals/new">
                  <Button>
                    <Plus size={15} />
                    Capture rental
                  </Button>
                </Link>
              )
            }
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Pickup</th>
                <th>Due back</th>
                <th>Returned</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th className="text-right">Balance</th>
                {isAdmin && <th>Captured by</th>}
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rental) => {
                const canEdit = isAdmin || (company?.members_edit_own_rentals && rental.created_by === user?.id)
                const open = rental.status === 'active' || rental.computed_status === 'overdue'
                return (
                  <tr key={rental.id}>
                    <td>
                      <Link
                        to={`/app/rentals/${rental.id}`}
                        className="font-semibold text-brand-700 hover:underline"
                      >
                        {rental.reference}
                      </Link>
                    </td>
                    <td className="max-w-48">
                      <div className="truncate font-medium text-ink-800">
                        {rental.customer?.full_name || '—'}
                      </div>
                      <div className="truncate text-xs text-ink-400">{rental.customer?.phone}</div>
                    </td>
                    <td>
                      <div className="text-ink-800">
                        {rental.car?.make} {rental.car?.model}
                      </div>
                      <div className="font-mono text-xs text-ink-400">
                        {rental.car?.registration}
                      </div>
                    </td>
                    <td className="text-ink-600">{formatDateTime(rental.pickup_at)}</td>
                    <td className="whitespace-nowrap text-ink-600">
                      {formatDateTime(rental.expected_return_at)}
                    </td>
                    <td className="text-ink-600">
                      {rental.actual_return_at ? (
                        formatDateTime(rental.actual_return_at)
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                    <td>
                      <RentalStatusBadge status={rental.computed_status} size="sm" />
                    </td>
                    <td className="text-right font-medium tabular-nums text-ink-800">
                      {money(rental.computed_total)}
                    </td>
                    <td className="text-right tabular-nums">
                      {rental.computed_balance > 0 ? (
                        <span className="font-semibold text-red-600">
                          {money(rental.computed_balance)}
                        </span>
                      ) : (
                        <span className="text-emerald-600">Settled</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="text-xs text-ink-500">
                        {rental.created_by_user?.full_name || '—'}
                      </td>
                    )}
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link to={`/app/rentals/${rental.id}`} title="View">
                          <Button variant="ghost" size="icon">
                            <Eye size={15} />
                          </Button>
                        </Link>
                        {canEdit && (
                          <Link to={`/app/rentals/${rental.id}/edit`} title="Edit">
                            <Button variant="ghost" size="icon">
                              <Pencil size={15} />
                            </Button>
                          </Link>
                        )}
                        {open && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Close rental"
                            onClick={() => navigate(`/app/rentals/${rental.id}?action=return`)}
                          >
                            <X size={15} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50">
                <td colSpan={isAdmin ? 7 : 6} className="px-4 py-3 text-xs font-medium text-ink-500">
                  {rows.length} rental{rows.length === 1 ? '' : 's'} shown
                </td>
                <td className="px-4 py-3 text-right font-semibold text-ink-800 tabular-nums">
                  {currencySymbol(currency)}
                  {Math.round(rows.reduce((sum, row) => sum + row.computed_total, 0)).toLocaleString('en-US')}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-red-600 tabular-nums">
                  {currencySymbol(currency)}
                  {Math.round(rows.reduce((sum, row) => sum + row.computed_balance, 0)).toLocaleString('en-US')}
                </td>
                {isAdmin && <td />}
                <td />
              </tr>
            </tfoot>
          </TableWrapper>
        )}
      </Card>

      <p className="mt-3 text-xs text-ink-400">
        Overdue is calculated automatically: a rental becomes overdue once its expected return time
        has passed and the vehicle has not been returned. Statuses available:{' '}
        {RENTAL_STATUSES.join(', ')}.
      </p>
    </>
  )
}