import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { takeIpSlot } from '@/lib/ip-rate-limit'
import { reportError, reportingOn } from '@/lib/error-report'

export const runtime = 'nodejs'

/* An error in a visitor's browser (components/ClientErrorReporter.tsx;
   owner 2026-10-26: error alerts). Open to anyone, so: 30 reports an hour
   per network, short fields only, and lib/error-report.ts mails at most 5
   browser errors an hour in all. Always answers 204: nothing to tell the
   page either way. */
export async function POST(req: NextRequest) {
  const done = new NextResponse(null, { status: 204 })
  if (!reportingOn()) return done
  let b: { message?: unknown; stack?: unknown; path?: unknown; ua?: unknown }
  try { b = await req.json() } catch { return done }
  const message = typeof b.message === 'string' ? b.message.slice(0, 300).trim() : ''
  if (!message) return done
  const path = typeof b.path === 'string' ? b.path.split('?')[0].slice(0, 200) : ''
  const stack = typeof b.stack === 'string' ? b.stack.slice(0, 1500) : ''
  const ua = typeof b.ua === 'string' ? b.ua.slice(0, 200) : ''
  const slot = await takeIpSlot(serviceClient(), req, 'client-error', 30, 3600_000)
  if (slot !== 'ok') return done
  await reportError({ source: 'browser', message, where: path, detail: [ua && `Browser: ${ua}`, stack].filter(Boolean).join('\n') })
  return done
}
