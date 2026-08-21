import { NextResponse } from 'next/server'

// Every route handler that reads a JSON body goes through here.
//
// `req.json()` REJECTS on a malformed body, and an unhandled rejection inside a
// route handler surfaces as a 500 -- which tells the caller that we broke, when
// in fact they sent us garbage. readJson turns the rejection into null so the
// handler can answer 400 and say so.
//
// It deliberately does NOT fall back to {}. An empty object slides past the
// parse and then fails a field check further down with a message about the
// wrong thing ("Missing booking_id" when the real problem was a truncated body).
export async function readJson(req: Request): Promise<any> {
  return req.json().catch(() => null)
}

export function badRequest(message = 'Invalid request body') {
  return NextResponse.json({ error: message }, { status: 400 })
}
