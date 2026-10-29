import { useRef, useState } from 'react'
import { Camera, Check, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Alert } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  PHOTO_SLOTS,
  REQUIRED_PHOTOS,
  prepareInspectionPhoto,
} from '@/lib/vehicleInspection'

/**
 * Eight fixed-angle photo slots. A file can be taken with the camera or picked
 * from the gallery, and the same order is used at pickup and return so the
 * comparison engine always pairs like with like.
 */
export function PhotoCapture({
  photos = [],
  onChange,
  disabled = false,
  accent = 'pickup',
  title,
  description,
  className,
}) {
  const inputs = useRef({})
  const [busySlot, setBusySlot] = useState(null)
  const [error, setError] = useState(null)

  const bySlot = new Map(photos.map((photo) => [Number(photo.slot), photo]))
  const total = PHOTO_SLOTS.filter((slot) => bySlot.has(slot.slot)).length

  const choose = (slot) => {
    if (disabled) return
    inputs.current[slot]?.click()
  }

  const handleFile = async (slot, event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusySlot(slot)
    setError(null)
    try {
      const photo = await prepareInspectionPhoto(file, slot)
      onChange?.([...photos.filter((item) => Number(item.slot) !== slot), photo])
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusySlot(null)
    }
  }

  const remove = (slot) => {
    if (disabled) return
    onChange?.(photos.filter((item) => Number(item.slot) !== slot))
  }

  const complete = total === REQUIRED_PHOTOS

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {title && <p className="text-sm font-semibold text-ink-800">{title}</p>}
          {description && <p className="text-xs text-ink-500">{description}</p>}
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
            complete
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-amber-50 text-amber-700 ring-amber-200',
          )}
        >
          {complete && <Check size={12} />}
          {total} of {REQUIRED_PHOTOS} photos
        </span>
      </div>

      {error && (
        <Alert tone="danger" title="Could not add that photo">
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {PHOTO_SLOTS.map((slot) => {
          const photo = bySlot.get(slot.slot)
          const loading = busySlot === slot.slot
          return (
            <div
              key={slot.slot}
              className={cn(
                'group relative overflow-hidden rounded-xl border bg-ink-50',
                photo ? 'border-emerald-300' : 'border-dashed border-ink-300',
              )}
            >
              <input
                ref={(element) => {
                  inputs.current[slot.slot] = element
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={disabled || loading}
                onChange={(event) => handleFile(slot.slot, event)}
              />

              {photo ? (
                <>
                  <img
                    src={photo.data_url}
                    alt={`${photo.label || slot.label} inspection photo`}
                    className="aspect-4/3 w-full object-cover"
                  />
                  <span className="absolute top-1.5 left-1.5 rounded-md bg-ink-950/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {slot.slot}. {slot.label}
                  </span>
                  {!disabled && (
                    <div className="absolute top-1.5 right-1.5 flex gap-1">
                      <button
                        type="button"
                        onClick={() => choose(slot.slot)}
                        className="rounded-md bg-ink-950/65 p-1 text-white transition hover:bg-ink-950/85"
                        aria-label={`Retake ${slot.label} photo`}
                        title="Retake"
                      >
                        <RefreshCw size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(slot.slot)}
                        className="rounded-md bg-red-600/85 p-1 text-white transition hover:bg-red-700"
                        aria-label={`Remove ${slot.label} photo`}
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => choose(slot.slot)}
                  disabled={disabled || loading}
                  className={cn(
                    'flex aspect-4/3 w-full flex-col items-center justify-center gap-1.5 px-2 text-center transition',
                    accent === 'return' ? 'hover:bg-amber-50' : 'hover:bg-brand-50',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                >
                  {loading ? (
                    <Loader2 size={19} className="animate-spin text-brand-600" />
                  ) : (
                    <Camera
                      size={19}
                      className={accent === 'return' ? 'text-amber-600' : 'text-brand-600'}
                    />
                  )}
                  <span className="text-[11px] leading-tight font-semibold text-ink-700">
                    {loading ? 'Preparing…' : slot.label}
                  </span>
                  <span className="text-[10px] leading-tight text-ink-400">{slot.hint}</span>
                </button>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-ink-400">
        Stand in the same position and use the same angle for every photo. Good light and a clean
        lens give the most reliable damage comparison.
      </p>
    </div>
  )
}
