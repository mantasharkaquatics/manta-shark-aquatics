import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminProgressHistoryClient from './AdminProgressHistoryClient'
import { allRows, IN_CHUNK } from '@/lib/db-paging'

/** A database row as the API returns it (untyped client). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any
export const dynamic = 'force-dynamic'

/** Reports per page. Each page signs only its own recordings (found 2026-10-08). */
const PAGE_SIZE = 40

export default async function AdminProgressHistoryPage({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const q = String(Array.isArray(sp.q) ? sp.q[0] : sp.q || '').trim().slice(0, 80)
  const page = Math.max(1, Math.floor(Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1))

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

  /* One page of approved reports, newest first, optionally for the swimmers
     whose name matches the search. This read every approved report on every
     visit: past 1,000 the oldest silently dropped out (and out of the search),
     the note and edit lookups put every lesson key in one URL and showed
     "no note" for all when that failed, and every recording was signed each
     time (found 2026-10-08). Now the search runs on the server and a page
     reads, pairs and signs only its own forty. */
  const problems: string[] = []
  let studentFilter: string[] | null = null
  if (q.length >= 2) {
    const like = '%' + q.replace(/[%_\\]/g, m => '\\' + m) + '%'
    const { data: hits, error } = await allRows(() => svc.from('students')
      .select('id').ilike('full_name', like).order('id'))
    if (error) problems.push('students')
    studentFilter = hits.map((h: Row) => h.id)
  }

  let records: Row[] = []
  let total = 0
  if (!studentFilter || studentFilter.length > 0) {
    let query = svc
      .from('progress_history')
      .select('id, student_id, coach_id, snapshot, session_date, created_at, reviewed_at, reviewed_by, lesson_key', { count: 'exact' })
      .eq('status', 'approved')
    // A name that matches more swimmers than one URL holds is cut to the first
    // IN_CHUNK; a search that broad is not looking for one family anyway.
    if (studentFilter) query = query.in('student_id', studentFilter.slice(0, IN_CHUNK))
    const from = (page - 1) * PAGE_SIZE
    const { data, error, count } = await query
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) problems.push('reports')
    records = data || []
    total = count ?? records.length
  }
  const pager = { page, pageSize: PAGE_SIZE, total, q }

  if (records.length === 0) {
    return <AdminProgressHistoryClient records={[]} skills={[]} pager={pager} loadError={problems.length > 0} />
  }

  const studentIds = [...new Set(records.map(r => r.student_id))]
  const coachIds = [...new Set(records.map(r => r.coach_id).filter(Boolean))]
  const adminIds = [...new Set(records.map(r => r.reviewed_by).filter(Boolean))]

  const [{ data: students, error: sErr }, { data: coaches }, { data: admins }, { data: skills }] = await Promise.all([
    svc.from('students').select('id, full_name, current_level').in('id', studentIds),
    svc.from('coaches').select('id, first_name').in('id', coachIds),
    svc.from('admins').select('id, first_name, last_name').in('id', adminIds),
    svc.from('skills').select('id, name, sort_order, level_id').order('sort_order'),
  ])
  if (sErr) problems.push('students')

  const sMap: Record<string, any> = {}
  for (const s of students || []) sMap[s.id] = s
  const cMap: Record<string, any> = {}
  for (const c of coaches || []) cMap[c.id] = c
  const aMap: Record<string, any> = {}
  for (const a of admins || []) aMap[a.id] = a

  // Notes pair by (student_id, lesson_key), not by date: a student can have two
  // lessons in one day and an hour lesson is two sessions but one lesson. Signed
  // urls are made here so the client only ever receives a ready link.
  const noteKeys = [...new Set(records.map((r: any) => r.lesson_key).filter(Boolean))]
  const noteByPair: Record<string, any> = {}
  if (noteKeys.length > 0) {
    const { data: notes, error: notesErr } = await svc
      .from('lesson_notes')
      .select('id, student_id, lesson_key, transcript, note, language, audio_seconds, audio_path')
      .in('lesson_key', noteKeys)
      .neq('status', 'rejected')
    if (notesErr) problems.push('notes')
    const notePaths = (notes || []).map((n: any) => n.audio_path).filter(Boolean)
    const signedByPath: Record<string, string> = {}
    if (notePaths.length > 0) {
      const { data: signed } = await svc.storage
        .from('lesson-audio').createSignedUrls(notePaths, 60 * 60)
      for (const s of signed || []) {
        if (s.path && s.signedUrl) signedByPath[s.path] = s.signedUrl
      }
    }
    for (const n of notes || []) {
      noteByPair[`${n.student_id}|${n.lesson_key}`] = {
        id: n.id,
        transcript: n.transcript || '',
        note: n.note || '',
        language: n.language || 'en',
        audio_seconds: n.audio_seconds,
        audio_url: n.audio_path ? (signedByPath[n.audio_path] || null) : null,
      }
    }
  }

  // The edit trail: a published report can be corrected, and every correction
  // stores what the family saw before it.
  const editsByPair: Record<string, any[]> = {}
  if (noteKeys.length > 0) {
    const { data: edits, error: editsErr } = await svc
      .from('report_edits')
      .select('id, student_id, lesson_key, prev_note, prev_snapshot, edited_by, edited_at')
      .in('lesson_key', noteKeys)
      .order('edited_at', { ascending: false })
    if (editsErr) problems.push('edits')
    const editorIds = [...new Set((edits || []).map((e: any) => e.edited_by).filter(Boolean))]
    let editors: any[] = []
    if (editorIds.length > 0) {
      const { data } = await svc.from('admins').select('id, first_name, last_name').in('id', editorIds)
      editors = data || []
    }
    const edMap: Record<string, any> = {}
    for (const a of editors) edMap[a.id] = a
    for (const e of edits || []) {
      const k = `${e.student_id}|${e.lesson_key}`
      if (!editsByPair[k]) editsByPair[k] = []
      editsByPair[k].push({ ...e, editor: edMap[e.edited_by] || null })
    }
  }

  const enriched = records.map((r: any) => ({
    ...r,
    student: sMap[r.student_id],
    coach: cMap[r.coach_id],
    reviewer: aMap[r.reviewed_by],
    note: noteByPair[`${r.student_id}|${r.lesson_key}`] || null,
    edits: editsByPair[`${r.student_id}|${r.lesson_key}`] || [],
  }))

  return <AdminProgressHistoryClient records={enriched} skills={skills || []} pager={pager} loadError={problems.length > 0} />
}
