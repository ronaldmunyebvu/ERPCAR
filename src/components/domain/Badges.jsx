import { cn, formatMoney, titleCase } from '@/lib/utils'
import { Badge } from '@/components/ui'
import { AlertTriangle, CalendarClock, CheckCircle2, Ban, Wrench, CircleParking, CircleOff, Crown, User } from 'lucide-react'

const RENTAL_TONES = {
  active: { tone: 'brand', label: 'Active', icon: CalendarClock },
  completed: { tone: 'success', label: 'Completed', icon: CheckCircle2 },
  overdue: { tone: 'danger', label: 'Overdue', icon: AlertTriangle },
  cancelled: { tone: 'neutral', label: 'Cancelled', icon: Ban },
}

export function RentalStatusBadge({ status, size = 'md' }) {
  const config = RENTAL_TONES[status] ?? RENTAL_TONES.active
  const Icon = config.icon
  return (
    <Badge tone={config.tone} size={size} dot>
      <Icon size={12} />
      {config.label}
    </Badge>
  )
}

const CAR_TONES = {
  available: { tone: 'success', label: 'Available', icon: CircleParking },
  rented: { tone: 'brand', label: 'Rented', icon: CalendarClock },
  maintenance: { tone: 'warning', label: 'Maintenance', icon: Wrench },
  inactive: { tone: 'neutral', label: 'Inactive', icon: CircleOff },
}

export function CarStatusBadge({ status, size = 'md' }) {
  const config = CAR_TONES[status] ?? CAR_TONES.inactive
  const Icon = config.icon
  return (
    <Badge tone={config.tone} size={size} dot>
      <Icon size={12} />
      {config.label}
    </Badge>
  )
}

export function RoleBadge({ role, size = 'md' }) {
  const admin = role === 'admin'
  const Icon = admin ? Crown : User
  return (
    <Badge tone={admin ? 'purple' : 'info'} size={size}>
      <Icon size={12} />
      {admin ? 'Owner / Admin' : 'Member'}
    </Badge>
  )
}

export function StatusBadge({ status, size = 'md' }) {
  return (
    <Badge tone={status === 'active' ? 'success' : 'neutral'} size={size} dot>
      {titleCase(status)}
    </Badge>
  )
}

export function PaymentMethodBadge({ method, size = 'sm' }) {
  const tones = {
    cash: 'neutral',
    card: 'info',
    ecocash: 'success',
    paynow: 'success',
    bank_transfer: 'brand',
    mobile_money: 'purple',
    stripe: 'brand',
  }
  return (
    <Badge tone={tones[method] ?? 'neutral'} size={size}>
      {titleCase(method)}
    </Badge>
  )
}

/* ---------------------------------------------------------------- stat card */

const STAT_TONES = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
  purple: 'bg-purple-50 text-purple-600',
  sky: 'bg-sky-50 text-sky-600',
  neutral: 'bg-ink-100 text-ink-600',
}

export function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = 'brand',
  onClick,
  footer,
  className,
  currency,
}) {
  const Component = onClick ? 'button' : 'div'
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'card flex items-start gap-3.5 p-4 text-left',
        onClick && 'transition hover:border-brand-300 hover:shadow-md',
        className,
      )}
    >
      {Icon && (
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', STAT_TONES[tone])}>
          <Icon size={19} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-ink-500">{label}</p>
        <p className="mt-0.5 text-xl leading-tight font-semibold text-ink-900 tabular-nums">
          {typeof value === 'number' && currency ? formatMoney(value, currency) : value}
        </p>
        {sublabel && <p className="mt-0.5 truncate text-xs text-ink-400">{sublabel}</p>}
        {footer}
      </div>
    </Component>
  )
}