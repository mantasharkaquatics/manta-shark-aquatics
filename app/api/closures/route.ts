import { NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { bannerClosures } from '@/lib/closures'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* The pool-closed banner at the top of every page (components/ClosureBanner,
   owner 2026-10-23). Anyone may ask: it sends only what the banner shows --
   the pool's name when more than one pool is open, the dates and hours, and
   the reason. Held for a minute at the edge. */
export async function GET() {
  const closures = await bannerClosures(serviceClient()).catch(() => [])
  return NextResponse.json({ closures }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } })
}
