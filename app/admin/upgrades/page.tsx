import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminUpgradesClient from './AdminUpgradesClient'

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

  // Two-step query: pending recommendations
  const { data: recs } = await svc
    .from('level_recommendations')
    .select('id, recommended_level, notes, created_at, student_id, coach_id, previous_recommended_level')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  let recommendations: any[] = []
  if (recs && recs.length > 0) {
    const studentIds = [...new Set(recs.map(r => r.student_id))]
    const coachIds = [...new Set(recs.map(r => r.coach_id))]
    const { data: recStudents } = await svc.from('students').select('id, full_name, current_level').in('id', studentIds)
    const { data: recCoaches } = await svc.from('coaches').select('id, first_name').in('id', coachIds)
    const sMap: Record<string, any> = {}
    for (const s of recStudents || []) sMap[s.id] = s
    const cMap: Record<string, any> = {}
    for (const c of recCoaches || []) cMap[c.id] = c

    // Fetch all of the student's history today (incl. rejected)
    const today = new Date().toISOString().slice(0, 10)
    const { data: allHistory } = await svc
      .from('level_recommendations')
      .select('student_id, coach_id, recommended_level, previous_recommended_level, status, created_at')
      .in('student_id', studentIds)
      .gte('created_at', today + 'T00:00:00Z')
      .order('created_at', { ascending: true })

    const historyByStudent: Record<string, any[]> = {}
    for (const h of allHistory || []) {
      if (!historyByStudent[h.student_id]) historyByStudent[h.student_id] = []
      historyByStudent[h.student_id].push(h)
    }

    recommendations = recs.map(r => ({
      ...r,
      student: sMap[r.student_id],
      coach: cMap[r.coach_id],
      previous_recommended_level: r.previous_recommended_level ?? null,
      history: historyByStudent[r.student_id] || [],
    }))
  }

  // upgrade history
  const { data: rawHistory } = await svc
    .from('level_upgrades')
    .select('id, from_level, to_level, upgraded_at, notes, student_id, upgraded_by')
    .order('upgraded_at', { ascending: false })
    .limit(30)

  let upgradeHistory: any[] = []
  if (rawHistory && rawHistory.length > 0) {
    const sIds = [...new Set(rawHistory.map(h => h.student_id).filter(Boolean))]
    const aIds = [...new Set(rawHistory.map(h => h.upgraded_by).filter(Boolean))]
    const { data: hStudents } = await svc.from('students').select('id, full_name').in('id', sIds)
    const { data: hAdmins } = await svc.from('admins').select('id, first_name, last_name').in('id', aIds)
    const hsMap: Record<string, any> = {}
    for (const s of hStudents || []) hsMap[s.id] = s
    const haMap: Record<string, any> = {}
    for (const a of hAdmins || []) haMap[a.id] = a
    upgradeHistory = rawHistory.map(h => ({
      ...h,
      students: hsMap[h.student_id],
      admins: haMap[h.upgraded_by],
    }))
  }

  const { data: levels } = await svc.from('levels').select('id, level_number, name').order('sort_order')
  const { data: skills } = await svc.from('skills').select('id, name, sort_order, level_id').order('sort_order')
  const { data: students } = await svc.from('students').select('id, full_name, current_level, is_active, parent_id').eq('is_active', true).order('full_name')

  const parentIds = [...new Set((students || []).map((s: any) => s.parent_id).filter(Boolean))]
  const { data: parents } = await svc.from('parents').select('id, first_name, last_name').in('id', parentIds)
  const pMap: Record<string, any> = {}
  for (const p of parents || []) pMap[p.id] = p
  const studentsNorm = (students || []).map((s: any) => ({ ...s, parents: pMap[s.parent_id] || null }))

  // Pending progress (today + all past unreviewed; nothing may slip through)
  const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const { data: allPendingProgress } = await svc
    .from('progress_history')
    .select('id, student_id, coach_id, snapshot, session_date, created_at, class_session_id')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })

  let pendingProgressList: any[] = []
  let pastPendingProgressList: any[] = []
  if (allPendingProgress && allPendingProgress.length > 0) {
    const ppStudentIds = [...new Set(allPendingProgress.map(p => p.student_id))]
    const ppCoachIds = [...new Set(allPendingProgress.map(p => p.coach_id).filter(Boolean))]
    const ppSessionIds = [...new Set(allPendingProgress.map((p: any) => p.class_session_id).filter(Boolean))]
    const { data: ppStudents } = await svc.from('students').select('id, full_name, current_level').in('id', ppStudentIds)
    const { data: ppCoaches } = await svc.from('coaches').select('id, first_name').in('id', ppCoachIds)
    const { data: ppSkills } = await svc.from('skills').select('id, name, sort_order, level_id').order('sort_order')
    const ppSMap: Record<string, any> = {}
    for (const s of ppStudents || []) ppSMap[s.id] = s
    const ppCMap: Record<string, any> = {}
    for (const c of ppCoaches || []) ppCMap[c.id] = c
    const ppSessionMap: Record<string, any> = {}
    if (ppSessionIds.length > 0) {
      const { data: ppSessions } = await svc
        .from('class_sessions')
        .select('id, start_time, end_time, course_types(name)')
        .in('id', ppSessionIds)
      for (const s of ppSessions || []) {
        const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
        ppSessionMap[s.id] = { start_time: s.start_time, end_time: s.end_time, course_name: ct?.name || '' }
      }
    }
    const enriched = allPendingProgress.map((p: any) => ({
      ...p,
      student: ppSMap[p.student_id],
      coach: ppCMap[p.coach_id],
      skills: ppSkills || [],
      session_info: ppSessionMap[p.class_session_id] || null,
    }))
    pendingProgressList = enriched.filter((p: any) => p.session_date === todayDate)
    pastPendingProgressList = enriched.filter((p: any) => p.session_date !== todayDate)
  }

  // Missing: students with a confirmed booking but no progress_history on any day, today or earlier (not just today, so forgotten days aren't lost)
  const { data: pastBookingsRaw } = await svc
    .from('bookings')
    .select('id, student_id, class_session_id')
    .eq('status', 'confirmed')

  // Absent students need no progress: keep only bookings with an attendance row (checked in)
  let pastBookings: any[] = []
  if (pastBookingsRaw && pastBookingsRaw.length > 0) {
    const { data: attRows } = await svc
      .from('attendance')
      .select('booking_id')
      .in('booking_id', pastBookingsRaw.map((b: any) => b.id))
    const attendedSet = new Set((attRows || []).map((r: any) => r.booking_id))
    pastBookings = pastBookingsRaw.filter((b: any) => attendedSet.has(b.id))
  }

  let missingProgressList: any[] = []
  if (pastBookings && pastBookings.length > 0) {
    const bSessionIds = [...new Set(pastBookings.map((b: any) => b.class_session_id).filter(Boolean))]
    const { data: pastSessions } = await svc
      .from('class_sessions')
      .select('id, session_date, coach_id, start_time, end_time, course_types(name), coaches(first_name)')
      .in('id', bSessionIds)
      .lte('session_date', todayDate)

    const sessionMap: Record<string, any> = {}
    for (const s of pastSessions || []) {
      const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
      const coach = Array.isArray((s as any).coaches) ? (s as any).coaches[0] : (s as any).coaches
      sessionMap[s.id] = { ...s, ct, coach }
    }

    // Each booking maps to one (student_id, session_date) pair: this student had a lesson that day
    const candidates = pastBookings
      .filter((b: any) => sessionMap[b.class_session_id])
      .map((b: any) => ({
        student_id: b.student_id,
        session: sessionMap[b.class_session_id],
      }))
      .filter((c: any) => c.student_id)

    if (candidates.length > 0) {
      const candidateStudentIds = [...new Set(candidates.map((c: any) => c.student_id))]
      const { data: existingHistory } = await svc
        .from('progress_history')
        .select('student_id, session_date')
        .in('student_id', candidateStudentIds)
        .lte('session_date', todayDate)

      const doneSet = new Set((existingHistory || []).map((p: any) => `${p.student_id}|${p.session_date}`))
      const missingCandidates = candidates.filter((c: any) => !doneSet.has(`${c.student_id}|${c.session.session_date}`))

      // At most one row per student per day (avoids duplicates from multiple same-day lessons)
      const dedupKey = new Set<string>()
      const dedupedCandidates = missingCandidates.filter((c: any) => {
        const key = `${c.student_id}|${c.session.session_date}`
        if (dedupKey.has(key)) return false
        dedupKey.add(key)
        return true
      })

      if (dedupedCandidates.length > 0) {
        const missingIds = [...new Set(dedupedCandidates.map((c: any) => c.student_id))]
        const { data: missingStudents } = await svc
          .from('students')
          .select('id, full_name, current_level')
          .in('id', missingIds)

        const studentMap: Record<string, any> = {}
        for (const s of missingStudents || []) studentMap[s.id] = s

        const { data: existingProgress } = await svc
          .from('student_skill_progress')
          .select('student_id, skill_id, progress_percent')
          .in('student_id', missingIds)

        const progressByStudent: Record<string, Record<string, number>> = {}
        for (const p of existingProgress || []) {
          if (!progressByStudent[p.student_id]) progressByStudent[p.student_id] = {}
          progressByStudent[p.student_id][p.skill_id] = p.progress_percent
        }

        missingProgressList = dedupedCandidates
          .filter((c: any) => studentMap[c.student_id])
          .sort((a: any, b: any) => a.session.session_date.localeCompare(b.session.session_date))
          .map((c: any) => ({
            ...studentMap[c.student_id],
            id: `${c.student_id}_${c.session.session_date}`,
            student_id: c.student_id,
            session: c.session,
            existingProgress: progressByStudent[c.student_id] || {},
          }))
      }
    }
  }

  return <AdminUpgradesClient
    upgradeHistory={upgradeHistory}
    adminId={admin.id}
    levels={levels || []}
    skills={skills || []}
    students={studentsNorm}
    recommendations={recommendations}
    pendingProgressList={pendingProgressList}
    pastPendingProgressList={pastPendingProgressList}
    missingProgressList={missingProgressList}
  />
}
