import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Match /api/chat/ai-reply so there is one model string to change, not two.
import { POLISH_MODEL } from '@/lib/ai/models'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: coach } = await svc
    .from('coaches').select('id, first_name, last_name')
    .eq('auth_user_id', user.id).single()
  if (!coach) return NextResponse.json({ error: 'Not a coach' }, { status: 403 })

  const form = await req.formData()
  const audio = form.get('audio') as File | null
  const studentId = String(form.get('student_id') || '')
  const classSessionId = String(form.get('class_session_id') || '')
  const lessonGroupId = (form.get('lesson_group_id') as string) || null
  const sessionDate = String(form.get('session_date') || '')
  const language = String(form.get('language') || 'en') === 'zh' ? 'zh' : 'en'
  const seconds = parseInt(String(form.get('seconds') || '0'), 10) || null

  // The skill percentages travel with the recording: the owner's rule is that a
  // coach cannot send one without the other, so they arrive as one submission.
  let progress: Record<string, number> = {}
  try {
    progress = JSON.parse(String(form.get('progress') || '{}'))
  } catch {
    return NextResponse.json({ error: 'Bad progress payload' }, { status: 400 })
  }

  if (!audio || !studentId || !classSessionId || !sessionDate) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (Object.keys(progress).length === 0) {
    return NextResponse.json({ error: 'Skill progress is missing' }, { status: 400 })
  }

  // A coach may only report on a lesson they are actually teaching.
  const { data: session } = await svc
    .from('class_sessions').select('id, coach_id').eq('id', classSessionId).single()
  if (!session || session.coach_id !== coach.id) {
    return NextResponse.json({ error: 'Not your lesson' }, { status: 403 })
  }

  const { data: student } = await svc
    .from('students').select('id, full_name').eq('id', studentId).single()
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const { data: glossaryRows } = await svc
    .from('note_glossary').select('term').eq('is_active', true).order('term')
  const glossary = (glossaryRows || []).map((g: any) => g.term)

  // Everyone in the lesson, so the transcriber has the names to hand. This is
  // what stopped "Kayden" coming back as "Caden".
  // two-step, never a nested join: those come back empty in production, and the
  // `|| student.full_name` fallback below hides it - a 1-on-4 would silently
  // send one name instead of four.
  const { data: roster } = await svc
    .from('bookings').select('student_id')
    .eq('class_session_id', classSessionId).neq('status', 'cancelled')
  const rosterIds = [...new Set((roster || []).map((b: any) => b.student_id).filter(Boolean))]
  let names: string[] = []
  if (rosterIds.length > 0) {
    const { data: rosterStudents } = await svc
      .from('students').select('full_name').in('id', rosterIds)
    names = [...new Set((rosterStudents || []).map((r: any) => r.full_name).filter(Boolean))]
  }

  // ---- 1. Keep the audio. Retention is deliberate: nothing purges this. ----
  const ext = (audio.type || '').includes('mp4') ? 'm4a' : 'webm'
  const audioPath = `${sessionDate}/${classSessionId}/${studentId}-${Date.now()}.${ext}`
  const { error: uploadError } = await svc.storage
    .from('lesson-audio')
    .upload(audioPath, audio, { contentType: audio.type || 'audio/mp4', upsert: false })
  if (uploadError) {
    return NextResponse.json({ error: 'Could not store the recording' }, { status: 500 })
  }

  // ---- 2. Speech to text ----
  // Deliberately before any writing of progress: if this fails the coach retries
  // and both halves go together, rather than progress landing on its own.
  let transcript = ''
  try {
    const sttForm = new FormData()
    sttForm.append('file', audio, `note.${ext}`)
    sttForm.append('model', 'gpt-transcribe')
    sttForm.append(
      'prompt',
      `游泳教學課後筆記。學生姓名：${names.join('、') || student.full_name}。`
      + `以下術語請保持英文原樣：${glossary.join(', ')}。`
    )
    const sttRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: sttForm,
    })
    const sttJson = await sttRes.json()
    if (!sttRes.ok) throw new Error(sttJson?.error?.message || 'transcription failed')
    transcript = String(sttJson.text || '').trim()
  } catch (err: any) {
    console.error('lesson-note: transcription failed', err)
    return NextResponse.json({ error: 'Could not transcribe the recording' }, { status: 502 })
  }
  if (!transcript) {
    return NextResponse.json({ error: 'Nothing was heard in that recording' }, { status: 422 })
  }

  // ---- 3. Turn speech into a note a parent can read ----
  let note = transcript
  try {
    const wanted = language === 'zh' ? 'Traditional Chinese (繁體中文)' : 'English'
    const anthRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: POLISH_MODEL,
        max_tokens: 700,
        system:
          `You turn a swim coach's spoken remarks into a short lesson note for the swimmer's family.\n`
          + `Write in ${wanted}. Warm, specific, plain: 2 to 4 sentences, no headings, no bullet points, no greeting or sign-off.\n`
          + `Keep these terms in English exactly as written, never translated or transliterated: ${glossary.join(', ')}.\n`
          + `Say only what the coach said. Do not invent skills, praise or next steps that were not mentioned.\n`
          + `Return the note text alone, with no preamble.`,
        messages: [{
          role: 'user',
          content: `Swimmer: ${student.full_name}\nCoach: ${coach.first_name}\n\nWhat the coach said:\n${transcript}`,
        }],
      }),
    })
    const anthJson = await anthRes.json()
    if (!anthRes.ok) throw new Error(anthJson?.error?.message || 'polish failed')
    const text = (anthJson.content || []).map((c: any) => c.text || '').join('').trim()
    if (text) note = text
  } catch (err: any) {
    // Falling back to the raw transcript beats losing the coach's work.
    console.error('lesson-note: polish failed, keeping raw transcript', err)
  }

  // ---- 4. One report per student per lesson: an hour is ONE lesson ----
  const lessonKey = lessonGroupId || classSessionId
  const now = new Date().toISOString()

  const noteRow = {
    student_id: studentId,
    coach_id: coach.id,
    class_session_id: classSessionId,
    lesson_group_id: lessonGroupId,
    session_date: sessionDate,
    audio_path: audioPath,
    audio_seconds: seconds,
    language,
    transcript,
    note,
    status: 'pending_review',
    updated_at: now,
  }

  const { data: existingNote } = await svc
    .from('lesson_notes').select('id')
    .eq('student_id', studentId).eq('lesson_key', lessonKey).maybeSingle()

  const { error: noteError } = existingNote
    ? await svc.from('lesson_notes').update(noteRow).eq('id', existingNote.id)
    : await svc.from('lesson_notes').insert(noteRow)

  if (noteError) {
    console.error('lesson-note: note save failed', noteError)
    return NextResponse.json({ error: 'Could not save the note' }, { status: 500 })
  }

  // ---- 5. The progress half, same lesson key ----
  // student_skill_progress is the live picture and is written now; the family
  // only ever sees the approved progress_history row, so nothing leaks early.
  const upserts = Object.entries(progress).map(([skill_id, pct]) => ({
    student_id: studentId,
    skill_id,
    progress_percent: pct as number,
    last_updated_by: coach.id,
    last_updated_at: now,
  }))
  const { error: sspError } = await svc
    .from('student_skill_progress')
    .upsert(upserts, { onConflict: 'student_id,skill_id' })
  if (sspError) {
    console.error('lesson-note: skill progress save failed', sspError)
    return NextResponse.json({ error: 'Could not save the skill progress' }, { status: 500 })
  }

  const historyRow = {
    student_id: studentId,
    coach_id: coach.id,
    snapshot: progress,
    session_date: sessionDate,
    class_session_id: classSessionId,
    lesson_group_id: lessonGroupId,
    status: 'pending_review',
  }

  const { data: existingHistory } = await svc
    .from('progress_history').select('id')
    .eq('student_id', studentId).eq('lesson_key', lessonKey).maybeSingle()

  const { error: historyError } = existingHistory
    ? await svc.from('progress_history').update(historyRow).eq('id', existingHistory.id)
    : await svc.from('progress_history').insert(historyRow)

  if (historyError) {
    console.error('lesson-note: progress history save failed', historyError)
    return NextResponse.json({ error: 'Could not save the progress record' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, note })
}
