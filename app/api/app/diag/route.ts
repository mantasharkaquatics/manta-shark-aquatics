import { NextRequest, NextResponse } from 'next/server'

/* A short-lived look at what the iPhone app's web view does with the
   phone's text size (2026-11-04: the owner raised it and nothing changed).
   The app reports, once per launch, what -apple-system-body measured and
   whether -webkit-text-size-adjust enlarges text there; this only writes it
   to the server log. To be removed once the text size works. */
export async function POST(req: NextRequest) {
  const raw = await req.text().catch(() => '')
  console.log('[app-diag]', raw.slice(0, 600))
  return NextResponse.json({ ok: true })
}
