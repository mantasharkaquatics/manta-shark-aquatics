import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const place_id = req.nextUrl.searchParams.get('place_id')
  if (!place_id) return NextResponse.json({})

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=address_components&key=${apiKey}`

  const res = await fetch(url)
  const data = await res.json()

  const components = data.result?.address_components || []
  let street_number = '', route = '', city = '', state = '', zip = ''
  for (const comp of components) {
    const type = comp.types[0]
    if (type === 'street_number') street_number = comp.long_name
    if (type === 'route') route = comp.long_name
    if (type === 'locality') city = comp.long_name
    if (type === 'administrative_area_level_1') state = comp.short_name
    if (type === 'postal_code') zip = comp.long_name
  }

  return NextResponse.json({
    address_line1: street_number + (route ? ' ' + route : ''),
    city, state, zip,
  })
}
