import { NextRequest, NextResponse } from 'next/server'

// Public endpoint: used on the registration page (user not yet authenticated).
// Input is length-limited; Google API key quota should be capped in Google Cloud Console.
export async function GET(req: NextRequest) {
  const input = (req.nextUrl.searchParams.get('input') || '').slice(0, 100)
  if (input.trim().length < 3) return NextResponse.json({ suggestions: [] })

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
