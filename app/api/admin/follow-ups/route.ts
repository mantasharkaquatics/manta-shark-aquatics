import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { getTodayLA } from '@/lib/date'
import { assessmentsWithoutBooking, lapsedFamilies, lastSummer, sendSummerReminders, summerFamilies } from '@/lib/follow-ups'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/* Admin > Follow-ups (owner, 2026-10-23; lib/follow-ups.ts).

   GET ?days=45                          -> { assess, lapsed, summerYear, today }
   POST { action: 'summer_preview', year } -> who the summer email would reach
   POST { action: 'summer_send', year }    -> send it (once per family per year) */

const DAY_CHOICES = [30, 45, 60, 90]

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const raw = Number(req.nextUrl.searchParams.get('days'))
  const days = DAY_CHOICES.includes(raw) ? raw : 45
  try {
    const today = getTodayLA()
    const [assess, lapsed] = await Promise.all([assessmentsWithoutBooking(auth.svc, today), lapsedFamilies(auth.svc, days, today)])
    return NextResponse.json({
      assess: assess.map(a => ({ id: a.assessmentId, student: a.studentName, family: a.family, email: a.email, phone: a.phone, subscribed: a.subscribed, assessedOn: a.assessedOn, daysSince: a.daysSince, course: a.course, frequency: a.frequency, sent: a.sent, studentId: a.studentId })),
      lapsed, days, summerYear: lastSummer(today), today,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[admin/follow-ups]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'unavailable', code: 'unavailable' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await readJson(req)
  if (!b) return badRequest()
  const year = Number(b.year)
  const thisYear = Number(getTodayLA().slice(0, 4))
  if (!Number.isInteger(year) || year < 2024 || year > thisYear) return NextResponse.json({ error: 'Invalid year', code: 'year' }, { status: 400 })
  try {
    if (b.action === 'summer_preview') {
      const fams = await summerFamilies(auth.svc, year)
      return NextResponse.json({ families: fams.map(f => ({ family: f.family, swimmers: f.swimmers, subscribed: f.subscribed && !!f.email, sent: f.sent })) })
    }
    if (b.action === 'summer_send') return NextResponse.json(await sendSummerReminders(auth.svc, year))
  } catch (e) {
    console.error('[admin/follow-ups]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'unavailable', code: 'unavailable' }, { status: 503 })
  }
  return badRequest()
}
