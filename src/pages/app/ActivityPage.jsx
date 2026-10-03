import { useMemo, useState } from 'react'
import { Activity as ActivityIcon, Filter, History, RefreshCw } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRepository, useResource } from '@/hooks/useRepository'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  SearchInput,
  Select,
  Spinner,
  TableWrapper,
} from '@/components/ui'
import { formatDateTime, initialsOf, relativeTime, downloadCsv, toDateInput } from '@/lib/utils'

const GROUPS = [
  { value: 'all', label: 'All activity' },
  { value: 'rental', label: 'Rentals' },
  { value: 'payment', label: 'Payments' },
  { value: 'customer', label: 'Customers' },
  { value: 'car', label: 'Fleet' },
  { value: 'user', label: 'Team' },
  { value: 'company', label: 'Company' },
  { value: 'auth', label: 'Sign-ins' },
]

const TONES = {
  rental: 'brand',
  payment: 'success',
  customer: 'purple',
  car: 'warning',
  user: 'info',
  company: 'neutral',
  auth: 'neutral',
}

export default function ActivityPage() {
  const { company, user } = useAuth()
  const { repository } = useRepository()
  const [group, setGroup] = useState('all')
  const [search, setSearch] = useState('')
  const [mine, setMine] = useState(false)

  const params = useMemo(
    () => ({ companyId: company?.id, action: group, userId: mine ? user?.id : undefined, limit: 300 }),
    [company?.id, group, mine, user?.id],
  )

  const log = useResource(
    () => (company?.id ? repository.activity.list(params) : Promise.resolve([])),
    `activity|${Boolean(repository)}|${params.companyId}|${group}|${mine}|${params.userId}`,
  )

  const rows = log.data || []

  const exportCsv = () =>
    downloadCsv(`activity-log-${toDateInput(new Date())}`, [
      { label: 'When', value: (row) => row.created_at },
      { label: 'Who', value: (row) => row.user?.full_name ?? 'System' },
      { label: 'Action', value: (row) => row.action },
      { label: 'Area', value: (row) => row.entity },
      { label: 'Details', value: (row) => row.summary },
    ], rows)

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every important action taken inside this company account."
        actions={
          <>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
              Export CSV
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Area" className="w-52">
            <Select value={group} onChange={(event) => setGroup(event.target.value)}>
              {GROUPS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Search" className="min-w-56 flex-1">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search summaries…"
            />
          </Field>
          <label className="mb-1 flex items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600"
              checked={mine}
              onChange={(event) => setMine(event.target.checked)}
            />
            Only my actions
          </label>
        </div>
      </Card>

      {log.loading ? (
        <Spinner label="Loading activity…" />
      ) : log.error ? (
        <Alert tone="danger" title="Could not load the activity log">
          {log.error.message}
        </Alert>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ActivityIcon}
            title="Nothing logged yet"
            message="Actions appear here as soon as your team starts working with rentals, payments and vehicles."
          />
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-3 text-xs text-ink-500">
            <Filter size={13} />
            Showing {rows.length} of the most recent entries
          </div>
          <TableWrapper>
            <thead>
              <tr>
                <th>Who</th>
                <th>Action</th>
                <th>Details</th>
                <th className="text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((row) =>
                  search.trim()
                    ? `${row.summary} ${row.action} ${row.user?.full_name ?? ''}`
                        .toLowerCase()
                        .includes(search.trim().toLowerCase())
                    : true,
                )
                .map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">
                          {initialsOf(row.user?.full_name || 'System')}
                        </span>
                        <div className="min-w-0">
                          <span className="block truncate font-medium text-ink-800">
                            {row.user?.full_name ?? 'System'}
                          </span>
                          <span className="block truncate text-xs text-ink-400">
                            {row.user?.email ?? 'Automated'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={TONES[row.entity] ?? 'neutral'} dot>
                        {row.action.replace(/\./g, ' ')}
                      </Badge>
                    </td>
                    <td className="text-ink-600">{row.summary}</td>
                    <td className="text-right">
                      <span className="block text-xs text-ink-500">{relativeTime(row.created_at)}</span>
                      <span className="block text-[11px] text-ink-300">{formatDateTime(row.created_at)}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </TableWrapper>
        </Card>
      )}
    </>
  )
}