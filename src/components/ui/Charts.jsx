import { useId, useMemo } from 'react'
import { cn, formatDate, toDate } from '@/lib/utils'

/* ------------------------------------------------------------ area chart */

export function AreaChart({
  data,
  xKey = 'date',
  series = [],
  height = 200,
  formatValue = (value) => formatNumber(value),
  formatLabel = (value) => formatDate(value),
  currency,
}) {
  const gradientId = useId()

  const width = 720
  const padding = { top: 12, right: 12, bottom: 26, left: 52 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const maxValue = Math.max(
    1,
    ...data.flatMap((row) => series.map((item) => Number(row[item.key]) || 0)),
  )
  const niceMax = niceCeiling(maxValue)

  const points = useMemo(() => {
    if (data.length === 0) return []
    const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0
    return data.map((row, index) => {
      const coordinates = series.map((item) => {
        const value = Number(row[item.key]) || 0
        return {
          x: padding.left + index * stepX,
          y: padding.top + plotHeight - (value / niceMax) * plotHeight,
          value,
        }
      })
      return { row, x: padding.left + index * stepX, coordinates }
    })
  }, [data, series, niceMax, plotHeight, plotWidth, padding.left, padding.top])

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: padding.top + plotHeight - ratio * plotHeight,
    value: niceMax * ratio,
  }))

  const labelStep = Math.max(1, Math.ceil(data.length / 7))

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Trend chart"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={tick.y}
              y2={tick.y}
              stroke="var(--color-ink-200)"
              strokeDasharray="3 4"
            />
            <text
              x={padding.left - 8}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-ink-400 text-[10px]"
            >
              {formatValue(tick.value)}
            </text>
          </g>
        ))}

        {series.map((item, seriesIndex) => {
          const line = points.map((point) => `${point.x},${point.coordinates[seriesIndex].y}`)
          const area = [
            `${padding.left},${padding.top + plotHeight}`,
            ...line,
            `${padding.left + (data.length > 1 ? plotWidth : 0)},${padding.top + plotHeight}`,
          ].join(' ')
          return (
            <g key={item.key}>
              {seriesIndex === 0 && data.length > 1 && (
                <polygon points={area} fill={`url(#${gradientId})`} />
              )}
              <polyline
                points={line.join(' ')}
                fill="none"
                stroke={item.color ?? 'var(--color-brand-500)'}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )
        })}

        {points.map((point, index) =>
          index % labelStep === 0 ? (
            <text
              key={index}
              x={point.x}
              y={height - 8}
              textAnchor="middle"
              className="fill-ink-400 text-[10px]"
            >
              {formatLabel(point.row[xKey], point.row)}
            </text>
          ) : null,
        )}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-4">
        {series.map((item) => (
          <span key={item.key} className="flex items-center gap-1.5 text-xs text-ink-500">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: item.color ?? 'var(--color-brand-500)' }}
            />
            {item.label}
          </span>
        ))}
        {currency && <span className="ml-auto text-xs text-ink-400">Values in {currency}</span>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- bar chart */

export function BarChart({ data, valueKey = 'value', labelKey = 'label', height = 220, formatValue }) {
  const max = Math.max(1, ...data.map((row) => Number(row[valueKey]) || 0))
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((row, index) => {
        const value = Number(row[valueKey]) || 0
        const percent = (value / max) * 100
        return (
          <div key={index} className="group flex flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[11px] font-medium text-ink-500 tabular-nums">
              {formatValue ? formatValue(value) : value}
            </span>
            <div
              className="w-full rounded-t-md bg-brand-500/85 transition-colors group-hover:bg-brand-600"
              style={{ height: `${Math.max(percent, value > 0 ? 3 : 0)}%` }}
              title={`${row[labelKey]}: ${formatValue ? formatValue(value) : value}`}
            />
            <span className="w-full truncate text-center text-[11px] text-ink-500" title={String(row[labelKey])}>
              {row[labelKey]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------ donut */

export function DonutChart({ data, size = 180, thickness = 22, centerLabel, centerValue }) {
  const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label="Breakdown chart">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-ink-100)"
            strokeWidth={thickness}
          />
          {total > 0 &&
            data.map((item) => {
              const fraction = (Number(item.value) || 0) / total
              const length = fraction * circumference
              const element = (
                <circle
                  key={item.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              )
              offset += length
              return element
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold text-ink-900 tabular-nums">{centerValue ?? total}</span>
          {centerLabel && <span className="text-[11px] text-ink-500">{centerLabel}</span>}
        </div>
      </div>
      <ul className="flex-1 space-y-2">
        {data.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: item.color }} />
            <span className="flex-1 text-ink-600">{item.label}</span>
            <span className="font-medium text-ink-800 tabular-nums">{item.value}</span>
            <span className="w-11 text-right text-xs text-ink-400 tabular-nums">
              {total ? Math.round(((Number(item.value) || 0) / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* --------------------------------------------------------- horizontal bars */

export function BarList({ items, formatValue, emptyLabel = 'No data yet' }) {
  const max = Math.max(1, ...items.map((item) => Number(item.value) || 0))
  if (items.length === 0) return <p className="py-6 text-center text-sm text-ink-400">{emptyLabel}</p>
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-ink-700">{item.label}</span>
            <span className="shrink-0 text-ink-500 tabular-nums">
              {formatValue ? formatValue(item.value) : item.value}
              {item.suffix && <span className="ml-1 text-xs text-ink-400">{item.suffix}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <div
              className={cn('h-full rounded-full', item.color ?? 'bg-brand-500')}
              style={{ width: `${((Number(item.value) || 0) / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------- utilities */

export function Sparkline({ values, height = 40, className, color = 'var(--color-brand-500)' }) {
  if (!values.length) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const step = values.length > 1 ? 100 / (values.length - 1) : 100
  const points = values
    .map((value, index) => `${index * step},${100 - ((value - min) / range) * 100}`)
    .join(' ')

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      style={{ height }}
      aria-hidden="true"
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function niceCeiling(value) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalised = value / magnitude
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10
  return step * magnitude
}

function formatNumber(value) {
  return Math.round(value).toLocaleString('en-US')
}

export { toDate }