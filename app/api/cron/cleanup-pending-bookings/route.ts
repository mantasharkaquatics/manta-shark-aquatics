import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'

type ExpiryNotice = {
  to: string
  parentName: string
  studentName: string
  courseName: string
  coachName: string
  date: string
  time: string
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find all expired pending_partner bookings
  const now = new Date().toISOString()
  const { data: expired } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, status, lesson_group_id')
    .in('status', ['pending_partner', 'in_cart'])
    .lt('pending_expires_at', now)

  // Also clean up expired reschedule pendings
  const { data: expiredReschedule } = await supabase
    .from('bookings')
    .select('id')
    .in('pending_action', ['reschedule', 'reschedule_initiator'])
    .lt('pending_expires_at', now)

  if ((expiredReschedule || []).length > 0) {
    const rids = (expiredReschedule || []).map((b: any) => b.id)
    await supabase.from('bookings').update({
      pending_action: null,
      pending_new_session_id: null,
      pending_expires_at: null,
    }).in('id', rids)
  }

  // Work out who to tell BEFORE deleting anything: once the rows are gone, so
  // are the links to the parent, the swimmer and the session. Cart holds are
  // skipped — an abandoned cart is not something to email anyone about.
  const invites = (expired || []).filter((b: any) => b.status === 'pending_partner')
  const notices: ExpiryNotice[] = []

  if (invites.length > 0) {
    try {
      const sessionIds = [...new Set(invites.map((b: any) => b.class_session_id).filter(Boolean))]
      const { data: sessions } = await supabase
        .from('class_sessions')
        .select('id, session_date, start_time, end_time, course_type_id, coach_id')
        .in('id', sessionIds)
      const sessionById: Record<string, any> = {}
      for (const s of sessions || []) { sessionById[(s as any).id] = s }

      const { data: cts } = await supabase
        .from('course_types').select('id, name')
        .in('id', [...new Set((sessions || []).map((s: any) => s.course_type_id).filter(Boolean))])
      const courseName: Record<string, string> = {}
      for (const c of cts || []) { courseName[(c as any).id] = (c as any).name }

      const { data: coaches } = await supabase
        .from('coaches').select('id, first_name, last_name')
        .in('id', [...new Set((sessions || []).map((s: any) => s.coach_id).filter(Boolean))])
      const coachName: Record<string, string> = {}
      for (const c of coaches || []) {
        coachName[(c as any).id] = ((c as any).first_name + ' ' + ((c as any).last_name || '')).trim()
      }

      const { data: parents } = await supabase
        .from('parents').select('id, first_name, email')
        .in('id', [...new Set(invites.map((b: any) => b.parent_id).filter(Boolean))])
      const parentById: Record<string, any> = {}
      for (const p of parents || []) { parentById[(p as any).id] = p }

      const { data: students } = await supabase
        .from('students').select('id, full_name')
        .in('id', [...new Set(invites.map((b: any) => b.student_id).filter(Boolean))])
      const studentName: Record<string, string> = {}
      for (const s of students || []) { studentName[(s as any).id] = (s as any).full_name }

      // One lesson per key. A 60-minute invitation is four rows sharing a
      // lesson_group_id; an old 30-minute pairing has no group id, but both
      // families sit on the same class_session, so that works as the key.
      const groups = new Map<string, any[]>()
      for (const b of invites) {
        const key = b.lesson_group_id || b.class_session_id
        if (!key) continue
        groups.set(key, [...(groups.get(key) || []), b])
      }

      for (const rows of groups.values()) {
        // Distinct sessions in start order, so an hour reads 9:10 – 10:10
        // rather than one message per half.
        const seen = new Set<string>()
        const sess: any[] = []
        for (const r of rows) {
          const s = sessionById[r.class_session_id]
          if (s && !seen.has(s.id)) { seen.add(s.id); sess.push(s) }
        }
        if (!sess.length) continue
        sess.sort((a, b) => (a.start_time < b.start_time ? -1 : 1))
        const first = sess[0]
        const last = sess[sess.length - 1]
        const timeStr = formatTime12h(first.start_time) + ' \u2013 ' + formatTime12h(last.end_time)

        // One message per family, naming every swimmer of theirs in the lesson.
        const byParent = new Map<string, string[]>()
        for (const r of rows) {
          if (!r.parent_id) continue
          const names = byParent.get(r.parent_id) || []
          const n = studentName[r.student_id]
          if (n && !names.includes(n)) names.push(n)
          byParent.set(r.parent_id, names)
        }

        for (const [parentId, names] of byParent) {
          const p = parentById[parentId]
          if (!p?.email) continue
          notices.push({
            to: p.email,
            parentName: p.first_name,
            studentName: names.join(' & '),
            courseName: courseName[first.course_type_id] || '',
            coachName: coachName[first.coach_id] || '',
            date: first.session_date,
            time: timeStr,
          })
        }
      }
    } catch (err) {
      // Notification is a courtesy; never let it stop the cleanup below.
      console.error('cleanup-pending-bookings: could not build expiry notices', err)
    }
  }

  const ids = (expired || []).map(b => b.id)
  let deleted = 0
  if (ids.length > 0) {
    await supabase.from('bookings').delete().in('id', ids)
    deleted = ids.length
  }

  // Deletion is done and committed; emails are best effort from here.
  let notified = 0
  for (const n of notices) {
    try {
      const ok = await sendEmail({ type: 'partner_invite_expired', ...n })
      if (ok) notified++
    } catch (err) {
      console.error('cleanup-pending-bookings: expiry email failed', err)
    }
  }

  return NextResponse.json({ deleted, checked: (expired || []).length, notified })
}
