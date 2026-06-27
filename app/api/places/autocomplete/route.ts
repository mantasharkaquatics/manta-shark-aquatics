import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get('input')
  if (!input) return NextResponse.json({ suggestions: [] })

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
    }),
  })

  const data = await res.json()
  const suggestions = (data.suggestions || []).map((s: any) => ({
    place_id: s.placePrediction?.placeId,
    description: s.placePrediction?.text?.text,
  })).filter((s: any) => s.place_id && s.description)

  return NextResponse.json({ suggestions })
}
