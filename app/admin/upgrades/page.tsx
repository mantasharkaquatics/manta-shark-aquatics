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

  // 兩步查詢：pending recommendations
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

    // 撈同學生今日所有歷史（含 rejected）
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

  // 今日待審核進度
  const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const { data: pendingProgress } = await svc
    .from('progress_history')
    .select('id, student_id, coach_id, snapshot, session_date, created_at')
    .eq('session_date', todayDate)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })

  let pendingProgressList: any[] = []
  if (pendingProgress && pendingProgress.length > 0) {
    const ppStudentIds = [...new Set(pendingProgress.map(p => p.student_id))]
    const ppCoachIds = [...new Set(pendingProgress.map(p => p.coach_id).filter(Boolean))]
    const { data: ppStudents } = await svc.from('students').select('id, full_name, current_level').in('id', ppStudentIds)
    const { data: ppCoaches } = await svc.from('coaches').select('id, first_name').in('id', ppCoachIds)
    const { data: ppSkills } = await svc.from('skills').select('id, name, sort_order, level_id').order('sort_order')
    const ppSMap: Record<string, any> = {}
    for (const s of ppStudents || []) ppSMap[s.id] = s
    const ppCMap: Record<string, any> = {}
    for (const c of ppCoaches || []) ppCMap[c.id] = c
    pendingProgressList = pendingProgress.map(p => ({
      ...p,
      student: ppSMap[p.student_id],
      coach: ppCMap[p.coach_id],
      skills: ppSkills || [],
    }))
  }

  // 今日未填寫：今天有 confirmed booking 但沒有 progress_history 記錄的學生
  const { data: todayBookings } = await svc
    .from('bookings')
    .select('student_id, class_session_id')
    .eq('status', 'confirmed')

  let missingProgressList: any[] = []
  if (todayBookings && todayBookings.length > 0) {
    // 過濾出今天的 booking（透過 class_sessions）
    const bSessionIds = [...new Set(todayBookings.map((b: any) => b.class_session_id).filter(Boolean))]
    const { data: todaySessions } = await svc
      .from('class_sessions')
      .select('id, coach_id, start_time, end_time, course_types(name), coaches(first_name)')
      .in('id', bSessionIds)
      .eq('session_date', todayDate)

    const todaySessionIds = new Set((todaySessions || []).map((s: any) => s.id))
    const todayStudentIds = [...new Set(
      todayBookings
        .filter((b: any) => todaySessionIds.has(b.class_session_id))
        .map((b: any) => b.student_id)
        .filter(Boolean)
    )]

    if (todayStudentIds.length > 0) {
      // 查已有 progress_history 的學生（今日，任何 status）
      const { data: todayProgress } = await svc
        .from('progress_history')
        .select('student_id')
        .in('student_id', todayStudentIds)
        .eq('session_date', todayDate)

      const doneStudentIds = new Set((todayProgress || []).map((p: any) => p.student_id))
      const missingIds = todayStudentIds.filter(id => !doneStudentIds.has(id))

      if (missingIds.length > 0) {
        const { data: missingStudents } = await svc
          .from('students')
          .select('id, full_name, current_level')
          .in('id', missingIds)

        // 找每個學生今天對應的 session（取第一筆）
        const sessionMap: Record<string, any> = {}
        for (const s of todaySessions || []) {
          const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
          const coach = Array.isArray((s as any).coaches) ? (s as any).coaches[0] : (s as any).coaches
          sessionMap[s.id] = { ...s, ct, coach }
        }
        const studentSessionMap: Record<string, any> = {}
        for (const b of todayBookings) {
          if (todaySessionIds.has(b.class_session_id) && !studentSessionMap[b.student_id]) {
            studentSessionMap[b.student_id] = sessionMap[b.class_session_id]
          }
        }

        // 撈各學生現有技能進度
        const { data: existingProgress } = await svc
          .from('student_skill_progress')
          .select('student_id, skill_id, progress_percent')
          .in('student_id', missingIds)

        const progressByStudent: Record<string, Record<string, number>> = {}
        for (const p of existingProgress || []) {
          if (!progressByStudent[p.student_id]) progressByStudent[p.student_id] = {}
          progressByStudent[p.student_id][p.skill_id] = p.progress_percent
        }

        missingProgressList = (missingStudents || []).map((s: any) => ({
          ...s,
          session: studentSessionMap[s.id] || null,
          existingProgress: progressByStudent[s.id] || {},
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
    missingProgressList={missingProgressList}
  />
}
