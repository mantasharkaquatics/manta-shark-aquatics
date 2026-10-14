import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getTodayLA } from '@/lib/date'
import { birthdayIn, birthdaysBetween, sendTestCard, skipReason, BIRTHDAY_GIFT_POINTS, BIRTHDAY_GIFT_MONTHS } from '@/lib/birthday'
import { SCHOOL_MAILING_ADDRESS } from '@/lib/site-config'

export const runtime = 'nodejs'

/* The "Birthday cards" admin page (owner, 2026-10-14).
   GET ?month=YYYY-MM   everyone with a birthday that month, what their card
                        is, and whether it went out
   POST { student_id }  a test card to the signed-in admin's own email: no
                        points, no record, and its unsubscribe link is inert
   POST { student_id, to: 'family' }  the same test card to the family's own
                        address -- for checking with a test family; marked
                        [TEST], still no points and no record */

function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, year: y }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const today = getTodayLA()
  const month = /^\d{4}-\d{2}$/.test(req.nextUrl.searchParams.get('month') || '') ? req.nextUrl.searchParams.get('month')! : today.slice(0, 7)
  const { from, to, year } = monthBounds(month)
  try {
    const list = await birthdaysBetween(auth.svc, from, to, today)
    const ids = list.map(s => s.studentId)
    const cards = new Map<string, any>()
    if (ids.length) {
      const { data, error } = await auth.svc.from('birthday_cards').select('student_id, status, sent_at, kind, points').eq('year', year).in('student_id', ids)
      if (error && !/birthday_cards/.test(error.message)) throw new Error(error.message)
      for (const c of data || []) cards.set(c.student_id, c)
    }
    return NextResponse.json({
      today, month,
      mailingAddressSet: !!SCHOOL_MAILING_ADDRESS.trim(),
      giftPoints: BIRTHDAY_GIFT_POINTS, giftMonths: BIRTHDAY_GIFT_MONTHS,
      items: list.map(s => ({
        studentId: s.studentId, name: s.fullName, date: s.date, age: s.age, kind: s.kind === 'adult' ? 'adult' : s.history,
        lang: s.lang, skip: skipReason(s), card: cards.get(s.studentId) || null,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const studentId = String(body?.student_id || '')
  let to = auth.user.email
  if (!studentId || !to) return NextResponse.json({ error: 'student_id required' }, { status: 400 })
  const today = getTodayLA()
  const { data: st } = await auth.svc.from('students').select('date_of_birth').eq('id', studentId).maybeSingle()
  if (!st?.date_of_birth) return NextResponse.json({ error: 'Swimmer not found' }, { status: 404 })
  // The swimmer as they will be on their next birthday this year.
  const day = birthdayIn(Number(today.slice(0, 4)), String(st.date_of_birth))
  const list = await birthdaysBetween(auth.svc, day, day, today)
  const sw = list.find(s => s.studentId === studentId)
  if (!sw) return NextResponse.json({ error: 'Swimmer not found' }, { status: 404 })
  if (body?.to === 'family') {
    if (!sw.email) return NextResponse.json({ error: 'Family has no email' }, { status: 409 })
    to = sw.email
  }
  const ok = await sendTestCard(sw, to)
  return ok ? NextResponse.json({ ok: true, to }) : NextResponse.json({ error: 'Email not sent' }, { status: 502 })
}
