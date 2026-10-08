// "Invitation Cancelled" when a 1-on-2 invitation could not be booked at the
// moment the invited family accepted it (found 2026-10-08).
//
// /api/bookings/confirm-partner ends the invitation when the time was taken,
// filled, a swimmer is busy, the inviting family cannot pay, the lesson is now
// under 30 minutes away, or the coach has since taken that time off. Only the
// family who pressed Accept saw why; the family who sent the invitation got
// nothing. `to: 'inviter'` tells that family (the accepter already read the
// reason on screen); `to: 'both'` tells everyone (owner, 2026-10-08, for the
// 30-minute and time-off cases).
//
// Best effort: the invitation is already cancelled when this runs, and a
// failed email must never undo or block that.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, type EmailPayload } from '@/lib/email'
import { formatTime12h } from '@/lib/date'

type Row = { class_session_id: string; parent_id: string; student_id: string | null }

export async function mailInviteFailed(
  svc: SupabaseClient,
  opts: {
    group: Row[]
    inviterParentId: string
    reason: NonNullable<EmailPayload['inviteFailReason']>
    to: 'inviter' | 'both'
    busyNames?: string
  },
): Promise<void> {
  try {
    const sessionIds = [...new Set(opts.group.map(r => r.class_session_id).filter(Boolean))]
    const parentIds = [...new Set(opts.group.map(r => r.parent_id).filter(Boolean))]
    const kidIds = [...new Set(opts.group.map(r => r.student_id).filter(Boolean))] as string[]
    if (sessionIds.length === 0 || parentIds.length === 0) return
    const [{ data: sess }, { data: parents }, { data: kids }] = await Promise.all([
      svc.from('class_sessions').select('session_date, start_time, end_time, course_type_id').in('id', sessionIds),
      svc.from('parents').select('id, first_name, last_name, email').in('id', parentIds),
      kidIds.length ? svc.from('students').select('id, full_name').in('id', kidIds) : Promise.resolve({ data: [] as any[] }),
    ])
    const ordered = [...(sess || [])].sort((a: any, b: any) => String(a.start_time).localeCompare(String(b.start_time)))
    if (ordered.length === 0) return
    const first = ordered[0] as any
    const last = ordered[ordered.length - 1] as any
    const { data: ct } = await svc.from('course_types').select('name').eq('id', first.course_type_id).maybeSingle()
    const kidName = new Map((kids || []).map((k: any) => [k.id, k.full_name]))
    const namesOf = (pid: string, same: boolean) => [...new Set(opts.group
      .filter(r => (r.parent_id === pid) === same)
      .map(r => kidName.get(r.student_id || '')).filter(Boolean))].join(' & ')
    const inviter = (parents || []).find((p: any) => p.id === opts.inviterParentId) as any
    const inviterName = inviter ? `${inviter.first_name || ''} ${inviter.last_name || ''}`.trim() : ''
    for (const p of (parents || []) as any[]) {
      const isInviter = p.id === opts.inviterParentId
      if (opts.to === 'inviter' && !isInviter) continue
      if (!p.email) continue
      await sendEmail({
        type: 'partner_invite_failed',
        to: p.email,
        parentName: p.first_name,
        studentName: namesOf(p.id, true),
        partnerName: namesOf(p.id, false),
        inviterName,
        courseName: ((ct as any)?.name || '') + (ordered.length > 1 ? ' (60 min)' : ''),
        date: first.session_date,
        time: `${formatTime12h(first.start_time)} – ${formatTime12h(last.end_time)}`,
        inviteFailReason: opts.reason,
        isInviter,
        busyNames: opts.busyNames,
      }).catch(e => console.error('invitation-failed email failed:', e))
    }
  } catch (e) {
    console.error('mailInviteFailed:', e)
  }
}
