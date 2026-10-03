import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Building2,
  CalendarRange,
  Car,
  ChevronLeft,
  Gauge,
  History,
  LogOut,
  Menu,
  Users,
  UserCog,
  Wallet,
  X,
  KeyRound,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { cn, initialsOf } from '@/lib/utils'
import { dataSource } from '@/db'
import { RoleBadge } from '@/components/domain/Badges'
import { Button } from '@/components/ui'

function navSections({ isAdmin }) {
  const sections = [
    {
      label: 'Operations',
      items: [
        { to: '/app', label: 'Dashboard', icon: Gauge, end: true },
        { to: '/app/rentals/new', label: 'New Rental', icon: CalendarRange },
        { to: '/app/rentals', label: 'Rentals', icon: CalendarRange },
        { to: '/app/fleet', label: 'Fleet', icon: Car },
        { to: '/app/customers', label: 'Customers', icon: Users },
        { to: '/app/payments', label: 'Payments', icon: Wallet },
      ],
    },
  ]

  if (isAdmin) {
    sections.push({
      label: 'Management',
      items: [
        { to: '/app/reports', label: 'Reports', icon: BarChart3 },
        { to: '/app/members', label: 'Staff Members', icon: UserCog },
        { to: '/app/activity', label: 'Activity Log', icon: History },
        { to: '/app/company', label: 'Company', icon: Building2 },
      ],
    })
  }

  return sections
}

function SidebarContent({ onNavigate }) {
  const { user, company, isAdmin, signOut } = useAuth()
  const sections = navSections({ isAdmin })

  return (
    <div className="flex h-full flex-col bg-ink-950 text-ink-300">
      <div className="flex items-center gap-2.5 px-5 py-5">
        {company?.logo_url ? (
          <img
            src={company.logo_url}
            alt={company.name || 'Company logo'}
            className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
            <Car size={19} />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{company?.name || 'RentFlow'}</p>
          <p className="truncate text-[11px] text-ink-400">Car Rental Manager</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-wider text-ink-500 uppercase">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-brand-600 text-white'
                          : 'text-ink-300 hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    <item.icon size={17} />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-3">
        <NavLink
          to="/app/account"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
              isActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white',
            )
          }
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500/20 text-[11px] font-semibold text-brand-200">
            {initialsOf(user?.full_name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{user?.full_name}</span>
            <span className="block truncate text-[11px] text-ink-400">{user?.email}</span>
          </span>
        </NavLink>
        <div className="mt-2 flex items-center gap-2 px-1">
          <RoleBadge role={user?.role} size="sm" />
          <button
            type="button"
            onClick={signOut}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-400 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
        {dataSource === 'mock' && (
          <p className="mt-2 rounded-md bg-amber-400/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-300">
            Demo mode — data is stored in this browser only.
          </p>
        )}
      </div>
    </div>
  )
}

export function AppShell({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const { user, company, isAdmin, signOut } = useAuth()

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 transition-[width] duration-200 lg:block',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <div className="sticky top-0 h-screen">
          <div className={cn('h-full transition-[width] duration-200', collapsed && 'w-16')}>
            {collapsed ? (
              <div className="flex h-full flex-col items-center gap-3 bg-ink-950 py-4">
                {company?.logo_url ? (
                  <img
                    src={company.logo_url}
                    alt={company.name || 'Company logo'}
                    className="h-9 w-9 rounded-lg object-cover ring-1 ring-white/10"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
                    <Car size={19} />
                  </span>
                )}
                <nav className="flex flex-1 flex-col gap-1">
                  {navSections({ isAdmin })
                    .flatMap((section) => section.items)
                    .map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        title={item.label}
                        className={({ isActive }) =>
                          cn(
                            'grid h-10 w-10 place-items-center rounded-lg transition-colors',
                            isActive ? 'bg-brand-600 text-white' : 'text-ink-400 hover:bg-white/5 hover:text-white',
                          )
                        }
                      >
                        <item.icon size={18} />
                      </NavLink>
                    ))}
                </nav>
                <button
                  type="button"
                  onClick={signOut}
                  title="Sign out"
                  className="grid h-10 w-10 place-items-center rounded-lg text-ink-400 hover:bg-white/5 hover:text-white"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <SidebarContent />
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="absolute top-6 -right-3 grid h-6 w-6 place-items-center rounded-full border border-ink-300 bg-white text-ink-500 shadow-sm transition hover:text-ink-800"
          >
            {collapsed ? <ChevronLeft size={14} className="rotate-180" /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-80 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-950/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute top-5 -right-11 grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-40 border-b border-ink-200 bg-white/90 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900">
                {isAdmin ? 'Owner console' : 'Staff workspace'}
              </p>
              <p className="truncate text-[11px] text-ink-500">
                Signed in as {user?.full_name} · {user?.email}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={signOut}
              className="hidden sm:inline-flex"
            >
              <LogOut size={15} />
              Sign out
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  )
}

export { KeyRound }