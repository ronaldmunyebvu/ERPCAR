import { cn } from '@/lib/utils'

export function PageHeader({ title, description, actions, breadcrumbs, className, children }) {
  return (
    <div className={cn('mb-5', className)}>
      {breadcrumbs && (
        <nav className="mb-1.5 text-xs text-ink-500">{breadcrumbs}</nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function SectionGrid({ className, children }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', className)}>{children}</div>
}