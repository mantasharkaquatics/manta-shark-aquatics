import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const place_id = req.nextUrl.searchParams.get('place_id')
  if (!place_id) return NextResponse.json({})
  // Found 2026-10-05: the id went into the Google URL as typed, so "../x" or
  // "x?fields=*" could steer this keyed request at another Places endpoint.
  // Google place ids are URL-safe base64-ish; anything else is not one.
  if (place_id.length > 512 || !/^[A-Za-z0-9_-]+$/.test(place_id)) {
    return NextResponse.json({ error: 'Invalid place_id' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(place_id)}`

  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': apiKey!,
      'X-Goog-FieldMask': 'addressComponents',
    },
  })

  const data = await res.json()
  const components = data.addressComponents || []

  let street_number = '', route = '', city = '', state = '', zip = ''
  for (const comp of components) {
    const types = comp.types || []
    if (types.includes('street_number')) street_number = comp.longText
    if (types.includes('route')) route = comp.longText
    if (types.includes('locality')) city = comp.longText
    if (types.includes('administrative_area_level_1')) state = comp.shortText
    if (types.includes('postal_code')) zip = comp.longText
  }

  return NextResponse.json({
    address_line1: street_number + (route ? ' ' + route : ''),
    city, state, zip,
  })
}
