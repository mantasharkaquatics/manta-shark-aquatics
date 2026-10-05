import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { takeIpSlot } from '@/lib/ip-rate-limit'

export const runtime = 'nodejs'

// Public endpoint: used on the registration page, before the family has an
// account, so it cannot require a login. Every call is a paid Places request
// on the server's key (a referrer restriction cannot help a server-side key),
// so it is fenced per network (found 2026-10-05). The page asks once per
// 300ms pause while typing; a few addresses an hour fits well inside this.
// The Google Cloud quota on the key stays the backstop.
const MAX_PER_IP_PER_HOUR = 60

export async function GET(req: NextRequest) {
  const input = (req.nextUrl.searchParams.get('input') || '').slice(0, 100)
  if (input.trim().length < 3) return NextResponse.json({ suggestions: [] })

  // The page treats an empty list as "no suggestions" and lets them type on.
  const slot = await takeIpSlot(serviceClient(), req, 'places-autocomplete', MAX_PER_IP_PER_HOUR, 60 * 60 * 1000)
  if (slot !== 'ok') return NextResponse.json({ suggestions: [] }, { status: slot === 'limited' ? 429 : 503 })

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  const url = `https://places.googleapis.com/v1/places:autocomplete`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey!,
    },
    body: JSON.stringify({
      input,
      includedRegionCodes: ['us'],
      includedPrimaryTypes: ['street_address', 'premise'],
      // Bias results toward Southern California (centered near Brea/Walnut, ~80km radius)
      locationBias: {
        circle: {
          center: { latitude: 33.95, longitude: -117.85 },
          radius: 50000,
        },
      },
    }),
  })

  const data = await res.json()
  const suggestions = (data.suggestions || []).map((s: any) => ({
    place_id: s.placePrediction?.placeId,
    description: s.placePrediction?.text?.text,
  })).filter((s: any) => s.place_id && s.description)

  return NextResponse.json({ suggestions })
}
