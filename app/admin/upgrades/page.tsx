import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminUpgradesClient from './AdminUpgradesClient'
import { allRowsOrLog, allRowsIn } from '@/lib/db-paging'
import { getTodayLA } from '@/lib/date'
import { readLevelHistory } from '@/lib/admin/level-history'
import { assessmentWaitingIds } from '@/lib/level-change'

/** A database row as the API returns it (untyped client). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export default async function AdminUpgradesPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )


  // The newest page of the change log; the client pages further back and
  // reads one swimmer's own history through /api/admin/level-history.
  const { rows: upgradeHistory, more: historyMore, error: historyErr } = await readLevelHistory(svc)
  if (historyErr) console.error('levels page history: read failed:', historyErr.message || historyErr)

  const { data: levels } = await svc.from('levels').select('id, level_number, name').order('sort_order')
  // Retired skills (is_active = false) are not taught: listing them padded the
  // reference and its skill count (found 2026-10-08).
  const { data: skills } = await svc.from('skills').select('id, name, sort_order, level_id, stage').eq('is_active', true).order('stage').order('sort_order')
  // Every active swimmer, a page at a time: the API stops at 1,000 rows, and
  // the search below only finds who was read (found 2026-10-08). Ordered by a
  // unique key after the name so the pages do not overlap.
  const students = await allRowsOrLog('levels page students', () => svc.from('students')
    .select('id, full_name, current_level, current_stage, is_active, parent_id')
    .eq('is_active', true).order('full_name').order('id'))

  const parentIds = [...new Set(students.map((s: Row) => s.parent_id).filter(Boolean))] as string[]
  const { data: parents, error: parentsErr } = await allRowsIn(parentIds, c => svc.from('parents')
    .select('id, first_name, last_name').in('id', c).order('id'))
  if (parentsErr) console.error('levels page parents: read failed:', parentsErr.message || parentsErr)
  const pMap: Record<string, any> = {}
  for (const p of parents) pMap[p.id] = p

  /* A swimmer with no level whose paid Swim Assessment has happened -- the
     lesson is today or past, and they were checked in -- with no assessment
     report on file and no report for that lesson at all (not waiting in
     Reviews, not sent back to the coach): setting a level by hand here would
     leave the family without the report, its email and the 85-point credit.
     The page points such a swimmer to Reviews, where exactly that lesson is
     offered for backfill (owner, 2026-10-08). The same tests as the
     backfill route and the Reviews missing-progress pass: a hint for a
     family whose assessment is still ahead, who missed it, or whose report
     is already in, sent the admin looking for a card that was not there. */
  const unleveled = students.filter((s: Row) => !s.current_level).map((s: Row) => s.id as string)
  const [{ data: trialRows }, { data: reports }, { ids: assessmentWaiting, error: waitingErr }] = await Promise.all([
    allRowsIn(unleveled, c => svc.from('bookings').select('id, student_id, class_session_id, lesson_group_id')
      .in('student_id', c).eq('is_trial', true).eq('status', 'confirmed').order('id')),
    allRowsIn(unleveled, c => svc.from('student_assessments').select('student_id')
      .in('student_id', c).order('student_id')),
    // An assessment report waiting in Reviews or sent back to the coach: the
    // level comes from confirming it, and /api/admin/assign-level refuses
    // (assessment_waiting). The hint above covered only a swimmer with no
    // report at all, so this case had no word on the page (found 2026-10-08).
    assessmentWaitingIds(svc, unleveled),
  ])
  if (waitingErr) console.error('levels page waiting assessments: read failed:', waitingErr.message || waitingErr)
  const reported = new Set(reports.map((r: Row) => r.student_id))
  const trials = trialRows.filter((b: Row) => b.student_id && b.class_session_id && !reported.has(b.student_id))
  const trialStudents = [...new Set(trials.map((b: Row) => b.student_id))] as string[]
  const trialSessions = [...new Set(trials.map((b: Row) => b.class_session_id))] as string[]
  const [{ data: trialSess }, { data: attended }, { data: filed }] = await Promise.all([
    allRowsIn(trialSessions, c => svc.from('class_sessions').select('id, session_date')
      .in('id', c).lte('session_date', getTodayLA()).order('id')),
    allRowsIn(trials.map((b: Row) => b.id as string), c => svc.from('attendance').select('booking_id')
      .in('booking_id', c).order('booking_id')),
    allRowsIn(trialStudents, c => svc.from('progress_history').select('id, student_id, lesson_key')
      .in('student_id', c).order('id')),
  ])
  const happened = new Set(trialSess.map((x: Row) => x.id))
  const checkedIn = new Set(attended.map((a: Row) => a.booking_id))
  const filedLessons = new Set(filed.map((h: Row) => `${h.student_id}|${h.lesson_key}`))
  const paidAssessment = new Set(trials
    .filter((b: Row) => happened.has(b.class_session_id) && checkedIn.has(b.id)
      && !filedLessons.has(`${b.student_id}|${b.lesson_group_id || b.class_session_id}`))
    .map((b: Row) => b.student_id))
  const studentsNorm = students.map((s: Row) => ({
    ...s,
    parents: pMap[s.parent_id] || null,
    paidAssessment: !s.current_level && paidAssessment.has(s.id),
    assessmentWaiting: !s.current_level && assessmentWaiting.has(s.id),
  }))



  return <AdminUpgradesClient
    upgradeHistory={upgradeHistory}
    historyMore={historyMore}
    adminId={admin.id}
    levels={levels || []}
    skills={skills || []}
    students={studentsNorm}
  />
}
