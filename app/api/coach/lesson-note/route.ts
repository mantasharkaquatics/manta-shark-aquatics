import { NextRequest, NextResponse } from 'next/server'
import { skillLinesFor } from '@/lib/ai/skill-names'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Match /api/chat/ai-reply so there is one model string to change, not two.
import { POLISH_MODEL, RECORDING_LANGUAGES, LANGUAGE_NAMES, detectNoteLanguage } from '@/lib/ai/models'
import { isLevelNumber } from '@/lib/levels'
import { NOT_REAL_BOOKING_STATUSES } from '@/app/coach/real-booking'

const NOT_REAL = `(${NOT_REAL_BOOKING_STATUSES.join(',')})`


/** The report was approved while a resend was being transcribed: nothing new
 *  was saved over it (found 2026-10-07). CoachProgressClient maps it. */
const APPROVED_MEANWHILE = 'This report was approved while you were sending it. Ask an admin to correct it.'
// The note went through but the scores had been approved in between.
const SCORES_APPROVED_MEANWHILE = 'The scores were approved while you were sending this report. Your note was saved for review; the scores were not changed.'

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

  // is_active is the off-boarding switch, as in requireCoach(): a coach who has
  // left but still holds a session must be refused here too (found 2026-10-04).
  const { data: coach } = await svc
    .from('coaches').select('id, first_name, last_name, default_note_language')
    .eq('auth_user_id', user.id).eq('is_active', true).single()
  if (!coach) return NextResponse.json({ error: 'Not a coach' }, { status: 403 })

  const form = await req.formData()
  const audio = form.get('audio') as File | null
  const studentId = String(form.get('student_id') || '')
  const classSessionId = String(form.get('class_session_id') || '')
  // Only a hint. The group the report is filed under is read off the swimmer's
  // own booking below, never taken from the form.
  const formLessonGroupId = (form.get('lesson_group_id') as string) || null
  const sessionDate = String(form.get('session_date') || '')
  /* The recorder no longer asks. The language is read off the transcript
      further down, once there is something to read. This stays only as the
      fallback for a recording with no words in it at all. */
  const fallbackLang = (RECORDING_LANGUAGES as readonly string[])
    .includes(String((coach as any).default_note_language)) 
      ? String((coach as any).default_note_language) : 'en'
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

  // ...and only on a swimmer who is really in it (found 2026-10-04). The
  // session check alone let a coach file a report (which then also wrote the
  // live skill table) for ANY student id against one of their own sessions.
  // The swimmer needs a real booking (not cancelled, in a basket, unpaid or an
  // unaccepted invite) in this session, or in the other half of this session's
  // hour.
  // lesson_group_id comes from that booking, not the form, so a crafted group
  // id cannot point the report at someone else's lesson.
  const { data: ownBooking } = await svc
    .from('bookings').select('id, lesson_group_id')
    .eq('class_session_id', classSessionId).eq('student_id', studentId)
    .not('status', 'in', NOT_REAL).limit(1).maybeSingle()
  let lessonGroupId: string | null = ownBooking ? (ownBooking.lesson_group_id || null) : null
  if (!ownBooking) {
    let inGroup = false
    if (formLessonGroupId) {
      const [{ data: sessionInGroup }, { data: studentInGroup }] = await Promise.all([
        svc.from('bookings').select('id')
          .eq('class_session_id', classSessionId).eq('lesson_group_id', formLessonGroupId)
          .not('status', 'in', NOT_REAL).limit(1),
        svc.from('bookings').select('id')
          .eq('student_id', studentId).eq('lesson_group_id', formLessonGroupId)
          .not('status', 'in', NOT_REAL).limit(1),
      ])
      inGroup = !!sessionInGroup?.length && !!studentInGroup?.length
    }
    if (!inGroup) {
      return NextResponse.json({ error: 'This swimmer is not booked in this lesson.' }, { status: 403 })
    }
    lessonGroupId = formLessonGroupId
  }

  /* A relay hour (found 2026-10-04): the two halves of one lesson_group_id
     taught by different coaches. New relays have not been bookable since
     2026-07-29, but existing ones remain. Keyed by the group, the second
     coach's report found the first coach's row and overwrote it. In a relay
     each coach files their own half, keyed by their own class_session_id
     (lesson_group_id left off the row, so lesson_key falls back to the
     session). Matching on coach_id instead would leave two rows sharing one
     (student, lesson_key), and the admin Reviews card, the parent dashboard
     and the monthly report all pair a note to its progress on exactly that
     pair -- they would show one coach's note beside the other's scores. */
  if (lessonGroupId) {
    const { data: groupBookings } = await svc
      .from('bookings').select('class_session_id')
      .eq('lesson_group_id', lessonGroupId).not('status', 'in', NOT_REAL)
    const groupSessionIds = [...new Set((groupBookings || []).map((b: any) => b.class_session_id).filter(Boolean))]
    if (groupSessionIds.length > 0) {
      const { data: groupSessions } = await svc
        .from('class_sessions').select('id, coach_id').in('id', groupSessionIds)
      if ((groupSessions || []).some((g: any) => g.coach_id && g.coach_id !== coach.id)) {
        // A relay half is this coach's only if the swimmer is booked in it; the
        // other half is the other coach's to report.
        if (!ownBooking) {
          return NextResponse.json({ error: 'This swimmer is not booked in this lesson.' }, { status: 403 })
        }
        lessonGroupId = null
      }
    }
  }

  const { data: student } = await svc
    .from('students').select('id, full_name, current_level').eq('id', studentId).single()
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  /* A swimmer with no level is having their assessment. That report carries the
     level the coach would place them in, and the skills scored are that level's.
     Everything stays pending until an admin confirms the card in Reviews: the
     level, the note and the scores publish together or not at all. */
  const assessment = !student.current_level
  const recommendedLevel = form.get('recommended_level')
  if (assessment && !isLevelNumber(recommendedLevel)) {
    return NextResponse.json({ error: 'Pick the level to recommend first' }, { status: 400 })
  }
  const scoredLevel = assessment ? String(Number(recommendedLevel)) : String(student.current_level)

  // Only skills of the level being scored are kept. The page only ever shows
  // those, so anything else is a stale tab or a hand-made request.
  const { data: lvl } = await svc
    .from('levels').select('id').eq('level_number', scoredLevel).maybeSingle()
  if (!lvl) return NextResponse.json({ error: 'That level does not exist' }, { status: 400 })
  const { data: levelSkills } = await svc
    .from('skills').select('id, name, is_active').eq('level_id', lvl.id)
  // Active skills only (found 2026-10-04): a retired skill is not shown on the
  // recorder (/api/coach/progress GET filters is_active), so a score for one is
  // a stale tab or a hand-made request, and must not reach the live table when
  // the report is confirmed.
  const allowedSkills = new Set((levelSkills || []).filter((k: any) => k.is_active !== false).map((k: any) => k.id))
  for (const [id, v] of Object.entries(progress)) {
    const n = Number(v)
    if (!allowedSkills.has(id) || !Number.isFinite(n) || n < 0 || n > 100) delete progress[id]
    else progress[id] = n
  }
  if (Object.keys(progress).length === 0) {
    return NextResponse.json({ error: 'Skill progress is missing' }, { status: 400 })
  }

  // ---- 0. An approved report is final ----
  // Re-sending used to overwrite an APPROVED note and progress row and put them
  // back to pending_review, pulling a report the family had already been shown
  // (found 2026-10-04). Checked here, before the recording is stored or
  // transcribed and before an assessment's level recommendation is written.
  const lessonKey = lessonGroupId || classSessionId
  const [{ data: existingNote }, { data: existingHistory }] = await Promise.all([
    svc.from('lesson_notes').select('id, status')
      .eq('student_id', studentId).eq('lesson_key', lessonKey).maybeSingle(),
    svc.from('progress_history').select('id, status')
      .eq('student_id', studentId).eq('lesson_key', lessonKey).maybeSingle(),
  ])
  if (existingNote?.status === 'approved' || existingHistory?.status === 'approved') {
    return NextResponse.json({ error: 'This report has already been approved.' }, { status: 409 })
  }

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

  /* Whatever the coach actually spoke. The note is then written in that same
     language, which is what makes the admin's review valid: they read the note
     while listening to the recording. */
  const language = detectNoteLanguage(transcript, fallbackLang)

  // ---- 3. Turn speech into a note a parent can read ----
  let note = transcript
  try {
    const wanted = LANGUAGE_NAMES[language] || LANGUAGE_NAMES.en
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
          + `When the coach refers to one of these curriculum skills, however they phrase it or in whichever language, write the skill's official name exactly as listed first on its line. Skill names win over the English-terms list above:\n`
          + `${skillLinesFor(language, (levelSkills || []).filter((k: any) => k.is_active !== false))}\n`
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

  // ---- 3b. An assessment's level, pending beside the report ----
  // BEFORE the report is written. If a later step fails the coach is not
  // locked out (there is no report yet) and resending supersedes this one;
  // written after, a failure here left a report with no level that Reviews
  // could not confirm. The new one goes in first and only then are older
  // pending ones closed, so there is never a moment with none.
  if (assessment) {
    const { data: rec, error: recError } = await svc.from('level_recommendations').insert({
      student_id: studentId,
      coach_id: coach.id,
      recommended_level: Number(scoredLevel),
      notes: null,
    }).select('id').single()
    if (recError || !rec) {
      console.error('lesson-note: level recommendation save failed', recError)
      return NextResponse.json({ error: 'Could not save the recommended level' }, { status: 500 })
    }
    const { data: prior } = await svc
      .from('level_recommendations').select('id, recommended_level')
      .eq('student_id', studentId).eq('status', 'pending').neq('id', rec.id)
      .order('created_at', { ascending: false })
    if (prior && prior.length > 0) {
      await svc.from('level_recommendations').update({ status: 'rejected' }).in('id', prior.map((r: any) => r.id))
      await svc.from('level_recommendations')
        .update({ previous_recommended_level: prior[0].recommended_level }).eq('id', rec.id)
    }
  }

  // ---- 4. One report per student per lesson: an hour is ONE lesson ----
  // (lessonKey and the existing rows were looked up in step 0.)
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

  // neq('approved'): an admin approving while this request was transcribing
  // must still not be undone by it. That write then changes nothing, and the
  // route used to answer ok anyway -- the coach saw the new note as saved
  // while the family kept the approved one (found 2026-10-07). The rows
  // written are counted now, and the coach is told.
  const approvedMeanwhile = async () => {
    await svc.storage.from('lesson-audio').remove([audioPath]).catch(() => {})
    return NextResponse.json({ error: APPROVED_MEANWHILE }, { status: 409 })
  }
  const { data: noteWritten, error: noteError } = existingNote
    ? await svc.from('lesson_notes').update(noteRow).eq('id', existingNote.id).neq('status', 'approved').select('id')
    : await svc.from('lesson_notes').insert(noteRow).select('id')

  if (noteError) {
    console.error('lesson-note: note save failed', noteError)
    return NextResponse.json({ error: 'Could not save the note' }, { status: 500 })
  }
  if (!noteWritten || noteWritten.length === 0) return approvedMeanwhile()

  // ---- 5. The progress half, same lesson key ----
  // Queued only. student_skill_progress used to be written here, the moment
  // the coach sent the report -- and the stage trigger fired on that write, so
  // the family saw the swimmer in a new stage while the report still sat in
  // Reviews (found 2026-10-05). The owner's rule is that nothing the family
  // sees moves until an admin confirms: /api/admin/review-progress writes the
  // live table from the approved row. The coach's recorder reads this pending
  // row back (lib/skill-progress-sync pendingOverlay), so their next lesson
  // still starts from what they sent.
  const historyRow = {
    student_id: studentId,
    coach_id: coach.id,
    snapshot: progress,
    session_date: sessionDate,
    class_session_id: classSessionId,
    lesson_group_id: lessonGroupId,
    status: 'pending_review',
  }

  const { data: historyWritten, error: historyError } = existingHistory
    ? await svc.from('progress_history').update(historyRow).eq('id', existingHistory.id).neq('status', 'approved').select('id')
    : await svc.from('progress_history').insert(historyRow).select('id')

  if (historyError) {
    console.error('lesson-note: progress history save failed', historyError)
    return NextResponse.json({ error: 'Could not save the progress record' }, { status: 500 })
  }
  if (!historyWritten || historyWritten.length === 0) {
    // The scores were approved in between, after the note was rewritten: the
    // new note now waits in Reviews beside the approved scores. Keep the
    // recording (the note row points at it) and tell the coach.
    console.warn(`lesson-note: progress for ${studentId} / ${lessonKey} was approved while the coach resent it`)
    return NextResponse.json({ error: SCORES_APPROVED_MEANWHILE }, { status: 409 })
  }

  return NextResponse.json({ ok: true, note })
}
