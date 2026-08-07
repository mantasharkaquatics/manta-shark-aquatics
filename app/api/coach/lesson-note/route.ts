import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Match whatever /api/chat/ai-reply already uses so there is one model string
// to change, not two.
const POLISH_MODEL = 'claude-sonnet-4-6'

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

  if (!audio || !studentId || !classSessionId || !sessionDate) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // A coach may only write notes for a lesson they are actually teaching.
  const { data: session } = await svc
    .from('class_sessions').select('id, coach_id').eq('id', classSessionId).single()
  if (!session || session.coach_id !== coach.id) {
    return NextResponse.json({ error: 'Not your lesson' }, { status: 403 })
  }

  const { data: student } = await svc
    .from('students').select('id, full_name').eq('id', studentId).single()
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  // Terms the school wants left in English, kept as editable data so the office
  // can add words without a deploy.
  const { data: glossaryRows } = await svc
    .from('note_glossary').select('term').eq('is_active', true).order('term')
  const glossary = (glossaryRows || []).map((g: any) => g.term)

  // Everyone in the lesson, so the transcriber has the names to hand. This is
  // what stopped "Kayden" coming back as "Caden" in the August 3 probe.
  const { data: roster } = await svc
    .from('bookings').select('students(full_name)')
    .eq('class_session_id', classSessionId).neq('status', 'cancelled')
  const names = [...new Set(
    (roster || []).map((b: any) => (Array.isArray(b.students) ? b.students[0] : b.students)?.full_name).filter(Boolean)
  )]

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
  // The raw transcript is stored untouched; if the polish drifts, the office can
  // compare the two side by side during review.
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
    // Falling back to the raw transcript is better than losing the coach's work;
    // the admin can tidy it during review.
    console.error('lesson-note: polish failed, keeping raw transcript', err)
  }

  // ---- 4. One note per student per lesson: an hour is ONE lesson ----
  const lessonKey = lessonGroupId || classSessionId
  const row = {
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
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await svc
    .from('lesson_notes').select('id')
    .eq('student_id', studentId).eq('lesson_key', lessonKey).maybeSingle()

  const { error: saveError } = existing
    ? await svc.from('lesson_notes').update(row).eq('id', existing.id)
    : await svc.from('lesson_notes').insert(row)

  if (saveError) {
    console.error('lesson-note: save failed', saveError)
    return NextResponse.json({ error: 'Could not save the note' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, note })
}
