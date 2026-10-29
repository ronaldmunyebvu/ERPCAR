import { currentSession } from './auth.js'
import { one, query } from './db.js'
import { SESSION_COOKIE, fail, json, parseCookies, readBody } from './http.js'

const PHOTO_SLOTS = [
  { slot: 1, label: 'Front' },
  { slot: 2, label: 'Front left' },
  { slot: 3, label: 'Left side' },
  { slot: 4, label: 'Rear left' },
  { slot: 5, label: 'Rear' },
  { slot: 6, label: 'Rear right' },
  { slot: 7, label: 'Right side' },
  { slot: 8, label: 'Front right' },
]

function inspectionPhotos(photos) {
  if (!Array.isArray(photos) || photos.length !== PHOTO_SLOTS.length) return null
  const bySlot = new Map()
  for (const photo of photos) {
    const slot = Number(photo?.slot)
    const dataUrl = String(photo?.data_url || '')
    if (
      !Number.isInteger(slot) ||
      slot < 1 ||
      slot > PHOTO_SLOTS.length ||
      bySlot.has(slot) ||
      !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(dataUrl) ||
      dataUrl.length > 600_000
    ) {
      return null
    }
    bySlot.set(slot, dataUrl)
  }
  return bySlot.size === PHOTO_SLOTS.length ? bySlot : null
}

function normalizedRegions(regions) {
  if (!Array.isArray(regions)) return []
  return regions.slice(0, 5).flatMap((region) => {
    const values = ['x', 'y', 'width', 'height'].map((key) => Number(region?.[key]))
    if (!values.every(Number.isFinite)) return []
    const [x, y, width, height] = values
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
      return []
    }
    return [{
      x,
      y,
      width,
      height,
      confidence: Math.max(0, Math.min(100, Number(region.confidence) || 0)),
      description: String(region.description || '').slice(0, 240),
    }]
  })
}

function parseModelReport(content) {
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('The vision service returned an unreadable inspection report.')
  }
  if (!Array.isArray(parsed.views)) {
    throw new Error('The vision service returned an incomplete inspection report.')
  }

  const inputBySlot = new Map(parsed.views.map((view) => [Number(view.slot), view]))
  if (inputBySlot.size !== PHOTO_SLOTS.length || PHOTO_SLOTS.some(({ slot }) => !inputBySlot.has(slot))) {
    throw new Error('The vision service did not compare all eight photo angles.')
  }

  const views = PHOTO_SLOTS.map(({ slot, label }) => {
    const view = inputBySlot.get(slot)
    if (typeof view.damage_detected !== 'boolean') {
      throw new Error('The vision service returned an incomplete inspection report.')
    }
    const score = Math.max(0, Math.min(100, Math.round(Number(view.confidence) || 0)))
    return {
      slot,
      label,
      status: 'compared',
      score,
      damage_detected: view.damage_detected,
      summary: String(view.summary || '').slice(0, 500),
      regions: normalizedRegions(view.regions),
    }
  })
  const damaged = views.filter((view) => view.damage_detected)
  const confidence = views.reduce((maximum, view) => Math.max(maximum, view.score), 0)
  const summary = String(parsed.summary || '').slice(0, 1000) || (
    damaged.length
      ? `Possible new damage detected in ${damaged.map((view) => view.label).join(', ')}. Review the highlighted areas.`
      : 'No new damage detected across the eight matched views.'
  )

  return {
    version: 2,
    engine: 'OpenAI vision model',
    analysed_at: new Date().toISOString(),
    damage_detected: damaged.length > 0,
    confidence,
    summary,
    views,
  }
}

export default async function handler(event) {
  if (event.httpMethod !== 'POST') return fail('Method not allowed.', 405)

  let body
  try {
    body = readBody(event)
  } catch (error) {
    return fail(error.message, error.statusCode || 400)
  }

  try {
    const session = await currentSession(parseCookies(event)[SESSION_COOKIE])
    if (!session) return fail('Sign in to run the vehicle damage check.', 401)

    const rentalId = String(body.rentalId || '')
    if (!/^[0-9a-f-]{36}$/i.test(rentalId)) return fail('Invalid rental.', 400)
    const returnBySlot = inspectionPhotos(body.returnPhotos)
    if (!returnBySlot) return fail('Capture all 8 valid return inspection photos first.', 400)

    const rental = await one(
      'SELECT id FROM rentals WHERE id = $1 AND company_id = $2',
      [rentalId, session.companyId],
    )
    if (!rental) return fail('Rental not found.', 404)

    const pickupRows = await query(
      `SELECT slot, data_url FROM rental_photos
       WHERE rental_id = $1 AND company_id = $2 AND phase = 'pickup'
       ORDER BY slot`,
      [rentalId, session.companyId],
    )
    const pickupBySlot = inspectionPhotos(pickupRows)
    if (!pickupBySlot) return fail('A complete set of 8 pickup photos is required for comparison.', 409)

    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) return fail('AI damage checking is not configured on the server.', 503)

    const images = PHOTO_SLOTS.flatMap(({ slot, label }) => [
      { type: 'text', text: `Angle ${slot}: ${label}. Photo taken at pickup.` },
      { type: 'image_url', image_url: { url: pickupBySlot.get(slot), detail: 'high' } },
      { type: 'text', text: `Angle ${slot}: ${label}. Photo taken on return; compare with the immediately preceding pickup photo.` },
      { type: 'image_url', image_url: { url: returnBySlot.get(slot), detail: 'high' } },
    ])

    let response
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(45_000),
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4o-mini',
          temperature: 0.1,
          max_tokens: 3000,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: [
                'You inspect rental-car pickup and return photographs for newly occurring physical vehicle damage.',
                'Compare each adjacent pickup/return pair for the same angle. Ignore lighting, reflections, weather, dirt, background, and camera-position differences unless there is clear evidence of physical damage.',
                'Be conservative: report only visible new dents, scratches, cracks, broken or missing parts. Do not claim certainty when the evidence is ambiguous.',
                'Return JSON only with keys summary and views. Include exactly eight views, one per slot 1 through 8. Each view has slot, damage_detected (boolean), confidence (integer 0-100), summary, and regions.',
                'Each region has normalized x, y, width, height coordinates relative to the return photo (0-1), confidence (integer 0-100), and a short description. Use an empty regions array when no specific new damage is visible.',
                'Do not infer damage from an angle that is obscured or not comparable; mark its summary as inconclusive and set damage_detected true so a person reviews it.',
              ].join(' '),
            },
            { role: 'user', content: images },
          ],
        }),
      })
    } catch (error) {
      console.error('[api/inspection] vision request failed', error)
      return fail('The AI damage check could not be completed. Try again before closing the rental.', 502)
    }

    if (!response.ok) {
      console.error('[api/inspection] vision service returned status', response.status)
      return fail('The AI damage check is temporarily unavailable. Try again before closing the rental.', 502)
    }

    const result = await response.json()
    const content = result?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return fail('The AI damage check returned no inspection report. Try again before closing the rental.', 502)
    }
    return json({ data: parseModelReport(content) })
  } catch (error) {
    console.error('[api/inspection] request failed', error)
    return fail('The AI damage check could not be completed. Try again before closing the rental.', 502)
  }
}