import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LessonNotesClient from './LessonNotesClient'

export default async function AdminLessonNotesPage() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) redirect('/login')

  // Service role from here: this page joins four tables and the point of the
  // screen is that an admin sees everything, so RLS would only get in the way.
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: admin } = await svc
    .from('admins').select('id').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')

  // Foreign keys are named explicitly. bookings→class_sessions taught us what
  // an ambiguous embed costs: the query fails and the page just looks empty.
  const { data: rows, error } = await svc
    .from('lesson_notes')
    .select(`
      id, session_date, language, status, transcript, note,
      audio_path, audio_seconds, lesson_group_id, created_at, reviewed_at,
      students!student_id(full_name, current_level),
      coaches!coach_id(first_name, last_name),
      class_sessions!class_session_id(start_time, course_types(name))
    `)
    .order('session_date', { ascending: false })
    .limit(50)

  if (error) console.error('admin/lesson-notes: query failed', error)

  const one = (v: any) => (Array.isArray(v) ? v[0] : v)

  const notes = (rows || []).map((r: any) => {
    const session = one(r.class_sessions)
    return {
      id: r.id,
      studentName: one(r.students)?.full_name || '',
      studentLevel: one(r.students)?.current_level || '',
      coachName: [one(r.coaches)?.first_name, one(r.coaches)?.last_name].filter(Boolean).join(' '),
      sessionDate: r.session_date,
      startTime: session?.start_time || '',
      courseName: one(session?.course_types)?.name || '',
      // An hour is stored against its first half, so the session's own end_time
      // would read 30 minutes short. The group id is what says it was an hour.
      minutes: r.lesson_group_id ? 60 : 30,
      language: r.language,
      status: r.status,
      transcript: r.transcript || '',
      note: r.note || '',
      audioSeconds: r.audio_seconds,
      audioPath: r.audio_path as string | null,
      audioUrl: null as string | null,
      createdAt: r.created_at,
    }
  })

  // One call for every clip rather than one per row.
  const paths = notes.map(n => n.audioPath).filter(Boolean) as string[]
  if (paths.length > 0) {
    const { data: signed } = await svc.storage
      .from('lesson-audio').createSignedUrls(paths, 60 * 60)
    const urlByPath: Record<string, string> = {}
    for (const s of signed || []) {
      if (s.path && s.signedUrl) urlByPath[s.path] = s.signedUrl
    }
    for (const n of notes) {
      if (n.audioPath) n.audioUrl = urlByPath[n.audioPath] || null
    }
  }

  // Waiting first, then most recent. Nobody opens this screen to admire the
  // ones already done.
  notes.sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === 'pending_review') return -1
      if (b.status === 'pending_review') return 1
    }
    return a.sessionDate < b.sessionDate ? 1 : -1
  })

  return <LessonNotesClient notes={notes} />
}
