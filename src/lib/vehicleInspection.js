/**
 * Vehicle handover inspection.
 *
 * Every rental carries exactly eight photos of the car at pickup and eight at
 * return, taken from the same fixed angles. At return, a server-side vision
 * model compares each matching pair and reports possible new damage for a
 * person to review before the vehicle is released.
 */

export const REQUIRED_PHOTOS = 8

export const PHOTO_SLOTS = [
  { slot: 1, label: 'Front', hint: 'Straight on, full bumper in frame' },
  { slot: 2, label: 'Front left', hint: 'Front corner and driver side' },
  { slot: 3, label: 'Left side', hint: 'Whole driver side, stand back' },
  { slot: 4, label: 'Rear left', hint: 'Rear corner and driver side' },
  { slot: 5, label: 'Rear', hint: 'Straight on, full bumper in frame' },
  { slot: 6, label: 'Rear right', hint: 'Rear corner and passenger side' },
  { slot: 7, label: 'Right side', hint: 'Whole passenger side, stand back' },
  { slot: 8, label: 'Front right', hint: 'Front corner and passenger side' },
]

const MAX_DIMENSION = 960
const JPEG_QUALITY = 0.68
const MAX_PHOTO_CHARS = 480_000

/* ---------------------------------------------------------------- capture */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('This image could not be read. Try another photo.'))
    image.src = src
  })
}

function loadFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    loadImage(url)
      .then((image) => {
        URL.revokeObjectURL(url)
        resolve(image)
      })
      .catch((error) => {
        URL.revokeObjectURL(url)
        reject(error)
      })
  })
}

/**
 * Shrinks a camera photo before it is sent over the wire. Eight full-size
 * mobile photos would exceed the API's request limit and make the vision
 * comparison unnecessarily expensive.
 */
export async function prepareInspectionPhoto(file, slot) {
  if (!file) throw new Error('Choose a photo first.')
  if (!String(file.type || '').startsWith('image/')) {
    throw new Error('Only image files can be used for the inspection.')
  }

  const image = await loadFile(file)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) throw new Error('This image could not be read. Try another photo.')

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  if (dataUrl.length > MAX_PHOTO_CHARS) {
    throw new Error('This photo is still too large. Move closer or reduce the camera resolution.')
  }

  const slotInfo = PHOTO_SLOTS.find((item) => item.slot === Number(slot))
  return {
    slot: Number(slot),
    label: slotInfo?.label || `Photo ${slot}`,
    data_url: dataUrl,
    width: canvas.width,
    height: canvas.height,
    captured_at: new Date().toISOString(),
  }
}

export async function compareInspectionPhotos(rentalId, returnPhotos) {
  let response
  try {
    response = await fetch('/api/inspection', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rentalId, returnPhotos }),
    })
  } catch {
    throw new Error('Could not reach the AI damage check. Connect to the internet and try again.')
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    throw new Error(payload?.error || 'The AI damage check could not be completed. Try again.')
  }
  if (!payload?.data || payload.data.views?.length !== REQUIRED_PHOTOS) {
    throw new Error('The AI damage check returned an incomplete report. Try again before closing.')
  }
  return payload.data
}
