import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { getTodayLA } from '@/lib/date'
import { addDaysStr, issueVoucher, VOUCHER_DAYS } from '@/lib/vouchers'

export const runtime = 'nodejs'

// The front desk's view of make-up vouchers (docs/fixed-class-spec.md):
// every voucher, newest first, with the family and the lesson it came from;
// issue one by hand; void one with a reason.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc } = auth
  const { data: vs, error } = await svc.from('make_up_vouchers')
    .select('id, parent_id, student_id, student2_id, course_slug, minutes, reason, status, expires_on, source_booking_id, used_booking_id, used_at, void_reason, note, created_at')
    .order('created_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = vs || []
  const parentIds = [...new Set(rows.map((v: any) => v.parent_id))]
  const studentIds = [...new Set(rows.flatMap((v: any) => [v.student_id, v.student2_id]).filter(Boolean))]
  const bookingIds = [...new Set(rows.flatMap((v: any) => [v.source_booking_id, v.used_booking_id]).filter(Boolean))]
  const [{ data: ps }, { data: ss }, { data: bs }, { data: families }] = await Promise.all([
    parentIds.length ? svc.from('parents').select('id, first_name, last_name').in('id', parentIds) : Promise.resolve({ data: [] as any[] }),
    studentIds.length ? svc.from('students').select('id, full_name').in('id', studentIds) : Promise.resolve({ data: [] as any[] }),
    bookingIds.length ? svc.from('bookings').select('id, class_session_id').in('id', bookingIds) : Promise.resolve({ data: [] as any[] }),
    // For the issue form: every family and their swimmers.
    svc.from('parents').select('id, first_name, last_name, students(id, full_name, current_level)').order('last_name'),
  ])
  const sessIds = [...new Set((bs || []).map((b: any) => b.class_session_id))]
  const { data: sess } = sessIds.length
    ? await svc.from('class_sessions').select('id, session_date, start_time').in('id', sessIds)
    : { data: [] as any[] }
  const pName = new Map((ps || []).map((p: any) => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]))
  const sName = new Map((ss || []).map((s: any) => [s.id, s.full_name]))
  const sessOf = new Map((sess || []).map((s: any) => [s.id, s]))
  const lessonOf = new Map((bs || []).map((b: any) => [b.id, sessOf.get(b.class_session_id)]))
  const when = (id: string | null) => {
    const s: any = id ? lessonOf.get(id) : null
    return s ? `${s.session_date} ${String(s.start_time).slice(0, 5)}` : null
  }
  return NextResponse.json({
    today: getTodayLA(),
    vouchers: rows.map((v: any) => ({
      ...v,
      family: pName.get(v.parent_id) || '',
      swimmers: [sName.get(v.student_id), v.student2_id ? sName.get(v.student2_id) : null].filter(Boolean),
      fromLesson: when(v.source_booking_id),
      usedFor: when(v.used_booking_id),
    })),
    families: (families || []).map((f: any) => ({
      id: f.id, name: `${f.first_name || ''} ${f.last_name || ''}`.trim(),
      students: (f.students || []).map((s: any) => ({ id: s.id, name: s.full_name })),
    })).filter((f: any) => f.students.length > 0),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc, admin } = auth
  const body = await readJson(req)
  if (!body) return badRequest()

  if (body.action === 'issue') {
    const parentId = String(body.parent_id || '')
    const studentId = String(body.student_id || '')
    const student2Id = body.student2_id ? String(body.student2_id) : null
    const courseSlug = String(body.course_slug || '')
    const minutes = Number(body.minutes) === 60 ? 60 : 30
    if (!parentId || !studentId || !['1on1', '1on2', '1on4'].includes(courseSlug))
      return NextResponse.json({ error: 'Choose the family, the swimmer and the kind of lesson.' }, { status: 400 })
    if (courseSlug === '1on2' && (!student2Id || student2Id === studentId))
      return NextResponse.json({ error: 'A 1-on-2 voucher is for two swimmers of the same family.' }, { status: 400 })
    if (courseSlug !== '1on1' && minutes !== 30)
      return NextResponse.json({ error: 'Only a 1-on-1 voucher can be for 60 minutes.' }, { status: 400 })
    const { data: kids } = await svc.from('students').select('id').eq('parent_id', parentId)
      .in('id', [studentId, student2Id].filter(Boolean) as string[])
    if ((kids || []).length !== (student2Id ? 2 : 1))
      return NextResponse.json({ error: 'That swimmer is not in this family.' }, { status: 400 })
    const today = getTodayLA()
    const expiresOn = typeof body.expires_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.expires_on) && body.expires_on >= today
      ? body.expires_on : addDaysStr(today, VOUCHER_DAYS)
    const note = String(body.note || '').trim().slice(0, 300)
    if (!note) return NextResponse.json({ error: 'Write why this voucher is being issued.' }, { status: 400 })
    const r = await issueVoucher(svc, {
      parentId, studentId, student2Id: courseSlug === '1on2' ? student2Id : null, courseSlug, minutes,
      reason: 'admin', expiresOn, createdBy: admin.id, note,
    })
    if (!r.voucher) return NextResponse.json({ error: r.error || 'Could not issue the voucher.' }, { status: 500 })
    return NextResponse.json({ ok: true, voucher: r.voucher })
  }

  if (body.action === 'void') {
    const id = String(body.id || '')
    const reason = String(body.reason || '').trim().slice(0, 300)
    if (!id || !reason) return NextResponse.json({ error: 'Write why this voucher is being voided.' }, { status: 400 })
    const { data } = await svc.from('make_up_vouchers')
      .update({ status: 'void', voided_by: admin.id, voided_at: new Date().toISOString(), void_reason: reason })
      .eq('id', id).eq('status', 'active').select('id')
    if (!data || data.length === 0)
      return NextResponse.json({ error: 'Only an unused voucher can be voided. Refresh and try again.' }, { status: 409 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
