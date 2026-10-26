import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { recordCronRun } from '@/lib/error-report'

/**
 * Does this value equal CRON_SECRET? False when CRON_SECRET is not set.
 *
 * Comparing against a template string -- `Bearer ${process.env.CRON_SECRET}` --
 * turns an unset secret into the literal "Bearer undefined", and anyone who
 * sent that header could run the job (found 2026-10-08). Dev and production
 * share one Supabase, so a deployment without the variable would have let a
 * stranger send real reminder texts, emails and point grants.
 */
export function matchesCronSecret(value: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !value) return false
  const a = Buffer.from(value)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * The gate for every scheduled job (cron-job.org sends
 * `Authorization: Bearer <CRON_SECRET>`). Returns a 401 response to send back,
 * or null when the caller may proceed:
 *
 *   const denied = requireCron(req); if (denied) return denied
 */
export function requireCron(req: Request): NextResponse | null {
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
  if (matchesCronSecret(token)) {
    // When each job last ran, so one that stopped is noticed (owner,
    // 2026-10-26: error alerts). Never delays the job.
    try { recordCronRun(new URL(req.url).pathname) } catch { /* fine */ }
    return null
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
