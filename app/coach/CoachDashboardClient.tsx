'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useT, useLocale } from '@/lib/i18n/provider'
import { tDb } from '@/lib/i18n'
import { levelNameKey } from '@/lib/levels'
import { STAGES } from '@/lib/levels'
import { MASTERY_COLOR, MASTERY_FILL, masteryOf, masteryKey } from '@/lib/mastery'
import { isRealBooking } from './real-booking'


type Student = {
  id: string
  full_name: string
  current_level: string | null
  current_stage?: number | null
  profile_photo_url?: string
}

type Booking = {
  id: string
  status: string
  lesson_group_id: string | null
  is_trial?: boolean
  /** The session this booking is in (app/coach/page.tsx), kept through the hour merge. */
  session_id?: string
  // Null when the embed comes back without the student (RLS, deleted row).
  students: Student | null
}

type Session = {
  id: string
  session_date: string
  start_time: string
  end_time: string
  status: string
  course_types: { id?: string; name: string; slug: string }
  bookings: Booking[]
}

type Skill = {
  id: string
  name: string
  sort_order: number
  stage: number | null
  progress: number
  /** Sent by a coach, still waiting for an admin in Reviews. */
  pending: boolean
}

export default function CoachDashboardClient({
  coach,
  todaySessions,
  today,
  offIds = [],
  loadFailed: sessionsFailed = false,
}: {
  coach: { id: string; first_name: string; last_name: string; default_note_language?: 'zh-Hant' | 'en' }
  todaySessions: Session[]
  today: string
  /** Sessions inside the coach's time off, not yet handled by the office. */
  offIds?: string[]
  /** The class read failed: say so instead of "no classes today". */
  loadFailed?: boolean
}) {
  const t = useT()
  const router = useRouter()
  /* Below lg the skills panel stacks under every class, several screens down:
     tapping a swimmer changed only the row's colour and read as broken (found
     2026-10-08). On a narrow screen the tap now scrolls to the panel. */
  const panelRef = useRef<HTMLDivElement | null>(null)
  const showPanel = () => {
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches) return
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const locale = useLocale()
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [skills, setSkills] = useState<Skill[]>([])
  const [loadingSkills, setLoadingSkills] = useState(false)
  // null means "follow the swimmer": the stage they are in opens, the rest stay
  // shut. Reset whenever a different student is picked.
  const [openStage, setOpenStage] = useState<number | null>(null)
  const [allComplete, setAllComplete] = useState(false)
  const [levelName, setLevelName] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)

  const formatTime = (t: string) => {
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    return `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  // Real bookings only, and only ones whose student actually came back
  // (found 2026-10-04): in_cart / pending_payment / pending_partner are not a
  // swimmer in the pool, and a null embed used to crash on .full_name below.
  const activeBookings = (session: Session) =>
    session.bookings.filter(b => isRealBooking(b) && !!b.students)

  // The id of the student whose skills were asked for LAST (found 2026-10-04).
  // Tapping swimmer A then B quickly could let A's slower response land after
  // B's and paint A's skills under B's name; a stale response is ignored.
  const latestStudentRef = useRef<string | null>(null)

  /* Read through /api/coach/progress, the same answer the Progress page gets
     (found 2026-10-08). This panel used to read student_skill_progress
     straight from the browser, which only changes once an admin approves a
     report: a coach who had just sent one came back here to the old numbers
     and took it for unsaved. The route lays the coach's reports still in
     Reviews over the approved scores and says which ones those are. */
  const loadStudentSkills = async (student: Student, sessionId: string | undefined) => {
    latestStudentRef.current = student.id
    const stale = () => latestStudentRef.current !== student.id
    setSelectedStudent(student)
    setSkills([])
    setOpenStage(null)
    setAllComplete(false)
    setLevelName('')
    setLoadFailed(false)
    setLoadingSkills(true)

    // No level yet: the lesson is an assessment, scored on the Progress page.
    if (isNaN(parseInt(student.current_level || '')) || !sessionId) {
      setLoadingSkills(false)
      return
    }

    const res = await fetch(`/api/coach/progress?student_id=${encodeURIComponent(student.id)}&class_session_id=${encodeURIComponent(sessionId)}`).catch(() => null)
    const data = res && res.ok ? await res.json().catch(() => null) : null
    if (stale()) return
    if (!data) {
      setLoadFailed(true)
      setLoadingSkills(false)
      return
    }

    setLevelName(data.student?.level?.name || '')
    if (data.student) setSelectedStudent({ ...student, current_stage: data.student.current_stage ?? student.current_stage })
    const progressMap: Record<string, number> = data.progress || {}
    const pending = new Set<string>(Array.isArray(data.pendingSkillIds) ? data.pendingSkillIds : [])
    const combined: Skill[] = ((data.skills || []) as Omit<Skill, 'progress' | 'pending'>[]).map(s => ({
      id: s.id, name: s.name, sort_order: s.sort_order, stage: s.stage,
      progress: progressMap[s.id] ?? 0,
      pending: pending.has(s.id),
    }))

    setSkills(combined)
    setAllComplete(combined.length > 0 && combined.every(s => s.progress === 100))
    setLoadingSkills(false)
  }

  const hour = new Date().getHours()
  const greetKey = hour < 12 ? 'coach.today.greetMorning'
    : hour < 17 ? 'coach.today.greetAfternoon' : 'coach.today.greetEvening'

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">
          {t(greetKey, { name: coach.first_name })}
        </h1>
        <p className="text-gray-400 mt-1">
          {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Los_Angeles' })}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Today's Sessions */}
        <div>
          <h2 className="text-sm font-semibold text-[#c9a84c] mb-4 uppercase tracking-wider">
            {t('coach.today.classes')}
          </h2>

          {sessionsFailed ? (
            <div className="bg-red-900/20 rounded-xl p-6 text-center border border-red-500/40" role="alert">
              <p className="text-red-200">{t('coach.loadFailed')}</p>
              <button onClick={() => router.refresh()} className="mt-4 bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] text-sm font-semibold px-4 py-2 rounded-lg transition-all">{t('coach.reload')}</button>
            </div>
          ) : todaySessions.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl p-8 text-center border border-[#1e3a6e]">
              <p className="text-gray-400">{t('coach.today.none')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {todaySessions.map(session => (
                <div
                  key={session.id}
                  className={`bg-[#111d38] rounded-xl p-5 border transition-all cursor-pointer ${
                    selectedSession?.id === session.id ? 'border-[#c9a84c]' : 'border-[#1e3a6e] hover:border-[#c9a84c]/50'
                  }`}
                  onClick={() => { latestStudentRef.current = null; setSelectedSession(session); setSelectedStudent(null); setSkills([]) }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      {/* An assessment is booked into an ordinary 1-on-1 slot, so the
                          course name alone told the coach "1-on-1 private" for a
                          swimmer they were meant to be placing. */}
                      <p className="text-white font-semibold">{activeBookings(session).some(b => b.is_trial)
                        ? t('common.assessment')
                        : session.course_types?.id
                        ? tDb(locale, 'course_types', session.course_types.id, session.course_types.name)
                        : session.course_types?.name}</p>
                      <p className="text-[#c9a84c] text-sm">{formatTime(session.start_time)} – {formatTime(session.end_time)}</p>
                      {offIds.includes(session.id) && (
                        <span className="inline-block mt-1 text-[11px] text-amber-300 bg-amber-900/30 border border-amber-500/40 rounded-full px-2.5 py-0.5">{t('coach.offPending')}</span>
                      )}
                    </div>
                    <span className="bg-[#1e3a6e] text-gray-300 text-xs px-3 py-1 rounded-full">
                      {t('coach.today.studentCount', { n: activeBookings(session).length })}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {activeBookings(session).map(booking => (
                      <button
                        key={booking.id}
                        onClick={e => { e.stopPropagation(); setSelectedSession(session); setSelectedBooking(booking); if (booking.students) { loadStudentSkills(booking.students, booking.session_id || session.id); showPanel() } }}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left ${
                          selectedStudent?.id === booking.students?.id
                            ? 'bg-[#c9a84c]/20 border border-[#c9a84c]/50'
                            : 'bg-[#0d1529] hover:bg-[#1e3a6e]/50'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-[#1e3a6e] flex items-center justify-center flex-shrink-0">
                          <span className="text-[#c9a84c] text-xs font-bold">{booking.students?.full_name?.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">{booking.students?.full_name}</p>
                          <p className="text-gray-400 text-xs">{booking.students?.current_level ? t('coach.level', { n: booking.students.current_level }) : t('coach.progress.unassigned')}</p>
                        </div>
                        <span className="ml-auto text-gray-500 text-xs">{t('coach.today.viewProgress')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Lesson note, then Skill Progress */}
        <div ref={panelRef} className="scroll-mt-4">
          <h2 className="text-sm font-semibold text-[#c9a84c] mb-4 uppercase tracking-wider flex items-center gap-2 flex-wrap">
            {t('coach.skillProgress')}
            <span className="text-[10px] font-medium normal-case tracking-normal text-gray-500 bg-white/5 px-2 py-0.5 rounded">{t('coach.today.readOnly')}</span>
          </h2>

          {!selectedStudent ? (
            <div className="bg-[#111d38] rounded-xl p-8 text-center border border-[#1e3a6e]">
              <div className="text-4xl mb-3">👆</div>
              <p className="text-gray-400">{t('coach.today.pickStudent')}</p>
            </div>
          ) : loadingSkills ? (
            <div className="bg-[#111d38] rounded-xl p-8 text-center border border-[#1e3a6e]">
              <p className="text-gray-400">{t('coach.today.loadingSkills')}</p>
            </div>
          ) : (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] overflow-hidden">
              <div className="p-5 border-b border-[#1e3a6e]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1e3a6e] flex items-center justify-center">
                    <span className="text-[#c9a84c] font-bold">{selectedStudent.full_name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">{selectedStudent.full_name}</p>
                    <p className="text-gray-400 text-sm">{selectedStudent.current_level ? t(levelNameKey(selectedStudent.current_level)) : (levelName || t('coach.progress.unassigned'))}</p>
                  </div>
                </div>
                {allComplete && (
                  <div className="mt-3 bg-[#c9a84c]/20 border border-[#c9a84c]/50 rounded-lg p-3 flex items-center gap-2">
                    <span>🏆</span>
                    <p className="text-[#c9a84c] text-sm font-medium">{t('coach.today.allComplete')}</p>
                  </div>
                )}
              </div>

              {/* A 500px scroll box inside a page that also scrolls is a nested-scroll
                  trap on touch: a coach swiping to reach the next skill often moves
                  the page instead, or gets stuck inside the box. On a phone the list
                  just flows and the page scrolls; the cap stays from md up, where a
                  mouse wheel makes it a convenience rather than a trap. */}
              <div className="p-5 space-y-3 md:max-h-[500px] md:overflow-y-auto">
                {skills.length > 0 && skills.some(k => k.pending) && (
                  <p className="text-amber-300/90 text-xs">{t('coach.today.pendingNote')}</p>
                )}
                {skills.length === 0 ? (
                  <p className="text-gray-400 text-sm">{loadFailed ? t('coach.progress.loadFailed') : selectedStudent.current_level ? t('coach.today.noSkills') : t('coach.today.assessHint')}</p>
                ) : STAGES.flatMap(st => {
                  const inStage = skills.filter(k => Number(k.stage || 1) === st)
                  if (inStage.length === 0) return []
                  const done = inStage.filter(k => k.progress >= 100).length
                  const curStage = Number(selectedStudent?.current_stage || 1)
                  const isCurrent = curStage === st
                  const expanded = (openStage ?? curStage) === st
                  const allDone = done === inStage.length
                  return [(
                    <button
                      key={'stage' + st}
                      type="button"
                      onClick={() => setOpenStage(expanded ? 0 : st)}
                      aria-expanded={expanded}
                      className="w-full flex items-center gap-2 pt-1 flex-wrap text-left"
                    >
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${isCurrent ? 'bg-[#c9a84c] text-[#1a2744]' : 'bg-white/5 text-gray-500'}`}>{t('coach.stage', { n: st })}</span>
                      {isCurrent
                        ? <span className="text-[10px] text-[#c9a84c] font-semibold">{t('coach.stage.current')}</span>
                        : st < curStage
                          ? <span className="text-[10px] text-gray-500">{allDone ? '🎊 ' + t('coach.stage.done') : t('coach.stage.passed')}</span>
                          : <span className="text-[10px] text-gray-500">🔒 {t('coach.stage.notYet')}</span>}
                      <span className="text-[10px] text-gray-500 ml-auto font-mono">{done}/{inStage.length}</span>
                      <span className="text-[10px] text-gray-500 w-3 text-right">{expanded ? '▴' : '▾'}</span>
                    </button>
                  ), ...(expanded ? inStage : []).map(skill => (
                  <div key={skill.id}>
                    {/* The same words the Progress page marks with, not a
                        percentage, and a "pending review" tag on a mark that is
                        still waiting for an admin (found 2026-10-08). */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-gray-300 text-sm">{tDb(locale, 'skills', skill.id, skill.name)}</span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        {skill.pending && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 whitespace-nowrap">{t('coach.today.pending')}</span>
                        )}
                        <span className="text-sm font-semibold whitespace-nowrap" style={{ color: MASTERY_COLOR[masteryOf(skill.progress)] }}>
                          {t(masteryKey(masteryOf(skill.progress)))}
                        </span>
                      </span>
                    </div>
                    {/* A bar, not a row of buttons. This panel is read-only, and six
                        chips that look pressable but are not is a trap: the first
                        thing anyone does is tap them and conclude the app is broken.
                        Recording happens under Progress, where the chips do work. */}
                    <div className="w-full bg-[#0d1529] rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${MASTERY_FILL[masteryOf(skill.progress)]}%`, backgroundColor: MASTERY_COLOR[masteryOf(skill.progress)] }} />
                    </div>
                  </div>
                  ))]
                })}
              </div>

              {skills.length > 0 && (
                <div className="p-5 border-t border-[#1e3a6e]">
                  {/* Read-only here on purpose: a lesson report is progress AND a
                      recording together, so it is filled in on one screen only. */}
                  <p className="text-gray-500 text-xs text-center mb-3">{t('coach.today.footnote')}</p>
                  <a href="/coach/progress" className="block text-center w-full bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] font-semibold py-3 rounded-lg transition-all">{t('coach.today.goProgress')}</a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
