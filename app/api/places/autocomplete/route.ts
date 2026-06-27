import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get('input')
  if (!input) return NextResponse.json({ suggestions: [] })

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:us&types=address&key=${apiKey}`

  const res = await fetch(url)
  const data = await res.json()

  const suggestions = (data.predictions || []).map((p: any) => ({
    place_id: p.place_id,
    description: p.description,
  }))

  return NextResponse.json({ suggestions })
}
