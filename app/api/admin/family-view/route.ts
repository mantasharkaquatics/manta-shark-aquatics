import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getTodayLA, getNowMinutesLA } from '@/lib/date'
import { walletSummary } from '@/lib/points-wallet'
import { assessmentsForParent } from '@/lib/assessments'
import { stageProgress, resolveStage } from '@/lib/levels'
import { toLocale } from '@/lib/i18n'

export const runtime = 'nodejs'

const toMin = (t: string) => { const [h, m] = String(t || '00:00').slice(0, 5).split(':').map(Number); return h * 60 + m }

// One family as the family sees it on their dashboard, for the front desk:
// the swimmers' cards, points, make-up vouchers, fixed classes and upcoming
// lessons. Read-only, all through the service client -- the parent's own
// dashboard reads under the parent's login and cannot be borrowed for this.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc } = auth
  const parentId = req.nextUrl.searchParams.get('parent_id') || ''
  if (!parentId) return NextResponse.json({ error: 'Missing parent_id' }, { status: 400 })

  const { data: parent } = await svc.from('parents')
    .select('id, first_name, last_name, email, phone, preferred_language').eq('id', parentId).maybeSingle()
  if (!parent) return NextResponse.json({ error: 'Family not found' }, { status: 404 })
  const lang = toLocale(req.nextUrl.searchParams.get('lang') || parent.preferred_language || 'en')
  const today = getTodayLA(), now = getNowMinutesLA()

  const [{ data: kids }, wallet, assessments, { data: vouchers }, { data: fcs }, { data: reports }] = await Promise.all([
    svc.from('students').select('id, full_name, date_of_birth, gender, current_level, current_stage')
      .eq('parent_id', parentId).eq('is_active', true).order('sort_order'),
    walletSummary(svc, parentId),
    assessmentsForParent(svc, parentId, lang).catch(() => []),
    svc.from('make_up_vouchers').select('id, student_id, student2_id, course_slug, minutes, reason, expires_on, created_at')
      .eq('parent_id', parentId).eq('status', 'active').gte('expires_on', today).order('expires_on'),
    svc.from('fixed_classes').select('id, student_id, student2_id, course_type_id, minutes, coach_id, weekday, start_time')
      .eq('parent_id', parentId).eq('status', 'active'),
    svc.from('monthly_reports').select('student_id, month').eq('parent_id', parentId).eq('status', 'sent')
      .order('month', { ascending: false }),
  ])
  const students = kids || []
  const nameOf = new Map(students.map((s: any) => [s.id, s.full_name]))

  // Each swimmer's card: level, the stage they are on and how far through it,
  // worked out the way the dashboard does (lib/levels).
  const levelNums = [...new Set(students.map((s: any) => Number(s.current_level)).filter(n => n > 0))]
  const { data: lvls } = levelNums.length
    ? await svc.from('levels').select('id, level_number').in('level_number', levelNums)
    : { data: [] as any[] }
  const lvlId = new Map((lvls || []).map((l: any) => [Number(l.level_number), l.id]))
  const { data: skills } = lvlId.size
    ? await svc.from('skills').select('id, level_id, stage').in('level_id', [...lvlId.values()]).eq('is_active', true)
    : { data: [] as any[] }
  const { data: hist } = students.length
    ? await svc.from('progress_history').select('student_id, session_date, snapshot, created_at')
      .in('student_id', students.map((s: any) => s.id)).eq('status', 'approved')
      .order('session_date', { ascending: false }).order('created_at', { ascending: false })
    : { data: [] as any[] }
  const reportOf = new Map<string, string>()
  for (const r of reports || []) if (!reportOf.has(r.student_id)) reportOf.set(r.student_id, r.month)
  const creditOf = new Map(assessments.map(a => [a.studentId, a.credit]))

  const cards = students.map((s: any) => {
    const lvl = Number(s.current_level) || null
    let stage: number | null = null, percent = 0
    if (lvl) {
      const list = (skills || []).filter((k: any) => k.level_id === lvlId.get(lvl)).map((k: any) => ({ id: k.id, stage: Number(k.stage) || 1 }))
      const pct: Record<string, number> = {}
      for (const h of (hist || []).filter((x: any) => x.student_id === s.id))
        for (const [id, v] of Object.entries(h.snapshot || {})) if (!(id in pct)) pct[id] = Number(v) || 0
      const stages = stageProgress(list, pct)
      stage = resolveStage(s.current_stage, stages)
      percent = stages[stage - 1]?.percent ?? 0
    }
    const credit: any = creditOf.get(s.id)
    return {
      id: s.id, name: s.full_name, dob: s.date_of_birth, gender: s.gender, level: lvl, stage, percent,
      credit: credit && credit.status === 'pending' && credit.daysLeft > 0 ? credit : null,
      lastReport: reportOf.get(s.id) || null,
    }
  })

  // Fixed classes and upcoming lessons share one bookings read.
  const { data: bookings } = await svc.from('bookings')
    .select('id, student_id, status, class_session_id, points_charged, fixed_class_id, voucher_id, lesson_group_id, is_trial')
    .eq('parent_id', parentId).in('status', ['confirmed', 'pending_partner', 'pending_payment'])
  const sessIds = [...new Set((bookings || []).map((b: any) => b.class_session_id))]
  const { data: sess } = sessIds.length
    ? await svc.from('class_sessions').select('id, session_date, start_time, end_time, coach_id, course_type_id').in('id', sessIds)
    : { data: [] as any[] }
  const coachIds = [...new Set([...(sess || []).map((x: any) => x.coach_id), ...(fcs || []).map((f: any) => f.coach_id)])]
  const [{ data: coaches }, { data: cts }] = await Promise.all([
    coachIds.length ? svc.from('coaches').select('id, first_name').in('id', coachIds) : Promise.resolve({ data: [] as any[] }),
    svc.from('course_types').select('id, name, slug'),
  ])
  const coachOf = new Map((coaches || []).map((c: any) => [c.id, c.first_name]))
  const ctOf = new Map((cts || []).map((c: any) => [c.id, c]))
  const sOf = new Map((sess || []).map((x: any) => [x.id, x]))
  const future = (bookings || [])
    .map((b: any) => ({ ...b, s: sOf.get(b.class_session_id) as any }))
    .filter((b: any) => b.s && (b.s.session_date > today || (b.s.session_date === today && toMin(b.s.end_time) > now)))

  // A 60-minute lesson is two rows and a sibling 1-on-2 two seats: one line each.
  const lines = new Map<string, any>()
  for (const b of future.sort((a: any, c: any) => (a.s.session_date + a.s.start_time).localeCompare(c.s.session_date + c.s.start_time))) {
    const key = (b.lesson_group_id || b.class_session_id)
    const ex = lines.get(key)
    if (ex) {
      if (!ex.swimmers.includes(nameOf.get(b.student_id))) ex.swimmers.push(nameOf.get(b.student_id))
      if (b.s.end_time > ex.end) ex.end = b.s.end_time
      continue
    }
    const ct: any = ctOf.get(b.s.course_type_id)
    lines.set(key, {
      date: b.s.session_date, start: String(b.s.start_time).slice(0, 5), end: String(b.s.end_time).slice(0, 5),
      course: b.is_trial ? 'assessment' : ct?.slug || '', courseName: ct?.name || '', courseTypeId: ct?.id || null,
      coach: coachOf.get(b.s.coach_id) || '', swimmers: [nameOf.get(b.student_id)].filter(Boolean),
      status: b.status, fixed: !!b.fixed_class_id, makeUp: !!b.voucher_id,
    })
  }

  return NextResponse.json({
    lang,
    family: { id: parent.id, name: `${parent.first_name || ''} ${parent.last_name || ''}`.trim(), firstName: parent.first_name, email: parent.email, phone: parent.phone, language: parent.preferred_language },
    cards,
    wallet: {
      purchased: wallet.balancePurchased, granted: wallet.balanceGranted, arrears: wallet.arrears,
      grantedNext: wallet.grantedNextExpiry || null, lessonsCompleted: wallet.lessonsCompleted,
    },
    vouchers: (vouchers || []).map((v: any) => ({
      id: v.id, swimmers: [nameOf.get(v.student_id), v.student2_id ? nameOf.get(v.student2_id) : null].filter(Boolean),
      courseSlug: v.course_slug, minutes: v.minutes, reason: v.reason, expiresOn: v.expires_on,
    })),
    fixedClasses: (fcs || []).map((f: any) => {
      const mine = future.filter((b: any) => b.fixed_class_id === f.id)
      const ct: any = ctOf.get(f.course_type_id)
      return {
        id: f.id, swimmers: [nameOf.get(f.student_id), f.student2_id ? nameOf.get(f.student2_id) : null].filter(Boolean),
        courseSlug: ct?.slug || '', courseTypeId: ct?.id || null, courseName: ct?.name || '', minutes: f.minutes,
        weekday: f.weekday, time: String(f.start_time).slice(0, 5), coach: coachOf.get(f.coach_id) || '',
        left: new Set(mine.map((b: any) => b.lesson_group_id || b.class_session_id)).size,
        last: mine.map((b: any) => b.s.session_date).sort().pop() || null,
      }
    }),
    upcoming: [...lines.values()],
  })
}
