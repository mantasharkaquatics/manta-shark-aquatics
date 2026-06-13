'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const PROGRESS_OPTIONS = [0, 20, 40, 60, 80, 100]

type Student = {
  id: string
  full_name: string
  current_level: string
  profile_photo_url?: string
}

type Booking = {
  id: string
  status: string
  students: Student
}

type Session = {
  id: string
  session_date: string
  start_time: string
  end_time: string
  status: string
  course_types: { name: string; slug: string }
  bookings: Booking[]
}

type Skill = {
  id: string
  name: string
  sort_order: number
  progress: number
}

export default function CoachDashboardClient({
  coach,
  todaySessions,
  today,
}: {
  coach: { id: string; first_name: string; last_name: string }
  todaySessions: Session[]
  today: string
}) {
  const supabase = createClient()
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [skills, setSkills] = useState<Skill[]>([])
  const [loadingSkills, setLoadingSkills] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [allComplete, setAllComplete] = useState(false)

  const formatTime = (t: string) => {
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  const activeBookings = (session: Session) =>
    session.bookings.filter(b => b.status !== 'cancelled')

  const loadStudentSkills = async (student: Student) => {
    setSelectedStudent(student)
    setSkills([])
    setSaveSuccess(false)
    setLoadingSkills(true)

    // 找 level_id
    const { data: levelData } = await supabase
      .from('levels')
      .select('id')
      .eq('name', student.current_level)
      .single()

    if (!levelData) {
      setLoadingSkills(false)
      return
    }

    // 拿技能列表
    const { data: skillList } = await supabase
      .from('skills')
      .select('id, name, sort_order')
      .eq('level_id', levelData.id)
      .eq('is_active', true)
      .order('sort_order')

    if (!skillList) {
      setLoadingSkills(false)
      return
    }

    // 拿現有進度
    const { data: progressData } = await supabase
      .from('student_skill_progress')
      .select('skill_id, progress_percentage')
      .eq('student_id', student.id)
      .in('skill_id', skillList.map(s => s.id))

    const progressMap: Record<string, number> = {}
    progressData?.forEach(p => {
      progressMap[p.skill_id] = p.progress_percentage
    })

    const combined = skillList.map(s => ({
      ...s,
      progress: progressMap[s.id] ?? 0,
    }))

    setSkills(combined)
    setAllComplete(combined.every(s => s.progress === 100))
    setLoadingSkills(false)
  }

  const updateSkillProgress = (skillId: string, value: number) => {
    const updated = skills.map(s => s.id === skillId ? { ...s, progress: value } : s)
    setSkills(updated)
    setAllComplete(updated.every(s => s.progress === 100))
  }

  const saveProgress = async () => {
    if (!selectedStudent) return
    setSaving(true)
    setSaveSuccess(false)

    for (const skill of skills) {
      await supabase
        .from('student_skill_progress')
        .upsert({
          student_id: selectedStudent.id,
          skill_id: skill.id,
          progress_percentage: skill.progress,
          updated_by_coach_id: coach.id,
        }, { onConflict: 'student_id,skill_id' })
    }

    setSaving(false)
    setSaveSuccess(true)
    setAllComplete(skills.every(s => s.progress === 100))
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">
          Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, Coach {coach.first_name}
        </h1>
        <p className="text-gray-400 mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Today's Sessions */}
        <div>
          <h2 className="text-lg font-semibold text-[#c9a84c] mb-4 uppercase tracking-wider text-sm">
            Today's Classes
          </h2>

          {todaySessions.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl p-8 text-center">
              <p className="text-gray-400">No classes scheduled for today</p>
            </div>
          ) : (
            <div className="space-y-4">
              {todaySessions.map(session => (
                <div
                  key={session.id}
                  className={`bg-[#111d38] rounded-xl p-5 border transition-all cursor-pointer ${
                    selectedSession?.id === session.id
                      ? 'border-[#c9a84c]'
                      : 'border-[#1e3a6e] hover:border-[#c9a84c]/50'
                  }`}
                  onClick={() => {
                    setSelectedSession(session)
                    setSelectedStudent(null)
                    setSkills([])
                    setSaveSuccess(false)
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-white font-semibold">{session.course_types.name}</p>
                      <p className="text-[#c9a84c] text-sm">
                        {formatTime(session.start_time)} – {formatTime(session.end_time)}
                      </p>
                    </div>
                    <span className="bg-[#1e3a6e] text-gray-300 text-xs px-3 py-1 rounded-full">
                      {activeBookings(session).length} student{activeBookings(session).length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Students in this session */}
                  <div className="space-y-2">
                    {activeBookings(session).map(booking => (
                      <button
                        key={booking.id}
                        onClick={e => {
                          e.stopPropagation()
                          setSelectedSession(session)
                          loadStudentSkills(booking.students)
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left ${
                          selectedStudent?.id === booking.students.id
                            ? 'bg-[#c9a84c]/20 border border-[#c9a84c]/50'
                            : 'bg-[#0d1529] hover:bg-[#1e3a6e]/50'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-[#1e3a6e] flex items-center justify-center flex-shrink-0">
                          <span className="text-[#c9a84c] text-xs font-bold">
                            {booking.students.full_name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">{booking.students.full_name}</p>
                          <p className="text-gray-400 text-xs">{booking.students.current_level || 'No level assigned'}</p>
                        </div>
                        <span className="ml-auto text-gray-500 text-xs">View Progress →</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Skill Progress Panel */}
        <div>
          <h2 className="text-lg font-semibold text-[#c9a84c] mb-4 uppercase tracking-wider text-sm">
            Skill Progress
          </h2>

          {!selectedStudent ? (
            <div className="bg-[#111d38] rounded-xl p-8 text-center border border-[#1e3a6e]">
              <div className="text-4xl mb-3">👆</div>
              <p className="text-gray-400">Select a student from today's classes to view and update their skill progress</p>
            </div>
          ) : loadingSkills ? (
            <div className="bg-[#111d38] rounded-xl p-8 text-center border border-[#1e3a6e]">
              <p className="text-gray-400">Loading skills...</p>
            </div>
          ) : (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] overflow-hidden">
              {/* Student header */}
              <div className="p-5 border-b border-[#1e3a6e]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1e3a6e] flex items-center justify-center">
                    <span className="text-[#c9a84c] font-bold">{selectedStudent.full_name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">{selectedStudent.full_name}</p>
                    <p className="text-gray-400 text-sm">{selectedStudent.current_level}</p>
                  </div>
                </div>

                {allComplete && (
                  <div className="mt-3 bg-[#c9a84c]/20 border border-[#c9a84c]/50 rounded-lg p-3 flex items-center gap-2">
                    <span>🏆</span>
                    <p className="text-[#c9a84c] text-sm font-medium">All skills complete! Ready for level upgrade.</p>
                  </div>
                )}
              </div>

              {/* Skills list */}
              <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto">
                {skills.length === 0 ? (
                  <p className="text-gray-400 text-sm">No skills found for this level.</p>
                ) : (
                  skills.map(skill => (
                    <div key={skill.id}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-300 text-sm">{skill.name}</span>
                        <span className={`text-sm font-semibold ${skill.progress === 100 ? 'text-[#c9a84c]' : 'text-gray-400'}`}>
                          {skill.progress}%
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full bg-[#0d1529] rounded-full h-1.5 mb-2">
                        <div
                          className="bg-[#c9a84c] h-1.5 rounded-full transition-all"
                          style={{ width: `${skill.progress}%` }}
                        />
                      </div>
                      {/* Quick select buttons */}
                      <div className="flex gap-1">
                        {PROGRESS_OPTIONS.map(val => (
                          <button
                            key={val}
                            onClick={() => updateSkillProgress(skill.id, val)}
                            className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
                              skill.progress === val
                                ? 'bg-[#c9a84c] text-[#111d38]'
                                : 'bg-[#0d1529] text-gray-400 hover:bg-[#1e3a6e]'
                            }`}
                          >
                            {val}%
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Save button */}
              {skills.length > 0 && (
                <div className="p-5 border-t border-[#1e3a6e]">
                  {saveSuccess && (
                    <p className="text-green-400 text-sm text-center mb-3">✓ Progress saved successfully!</p>
                  )}
                  <button
                    onClick={saveProgress}
                    disabled={saving}
                    className="w-full bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] font-semibold py-3 rounded-lg transition-all"
                  >
                    {saving ? 'Saving...' : 'Save Progress'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
