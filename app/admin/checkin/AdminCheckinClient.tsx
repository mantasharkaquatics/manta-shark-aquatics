'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Student {
  id: string
  full_name: string
  parent_id: string
  parents: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
}

export default function AdminCheckinClient({ students }: { students: Student[] }) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [loading, setLoading] = useState('')

  const filtered = query.trim().length < 1 ? [] : students.filter(s => {
    const parent = Array.isArray(s.parents) ? s.parents[0] : s.parents
    const q = query.toLowerCase()
    return (
      s.full_name.toLowerCase().includes(q) ||
      (parent?.first_name + ' ' + parent?.last_name).toLowerCase().includes(q)
    )
  }).slice(0, 8)

  async function checkin(student: Student) {
    setLoading(student.id)
    setResult(null)

    const now = new Date()
    const windowStart = new Date(now.getTime() - 30 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + 30 * 60 * 1000)

    const pad = (n: number) => String(n).padStart(2, '0')
    const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
    const startTime = `${pad(windowStart.getHours())}:${pad(windowStart.getMinutes())}`
    const endTime = `${pad(windowEnd.getHours())}:${pad(windowEnd.getMinutes())}`

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, class_session_id, class_sessions(session_date, start_time)')
      .eq('student_id', student.id)
      .eq('status', 'confirmed')
      .then(async ({ data }) => {
        if (!data) return { data: null }
        const valid = data.find((b: any) => {
          const sess = Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions
          return sess?.session_date === today && sess?.start_time >= startTime && sess?.start_time <= endTime
        })
        return { data: valid || null }
      })

    if (!booking) {
      setResult({ success: false, message: `${student.full_name} 今天這個時段沒有課程` })
      setLoading('')
      return
    }

    const { error } = await supabase.from('attendance').insert({
      booking_id: booking.id,
      student_id: student.id,
      class_session_id: booking.class_session_id,
      check_in_method: 'manual',
      checked_in_by: 'admin',
      checked_in_at: now.toISOString(),
    })

    if (error) {
      setResult({ success: false, message: 'Check-in 失敗：' + error.message })
    } else {
      setResult({ success: true, message: `✓ ${student.full_name} Check-in 成功！` })
      setQuery('')
    }
    setLoading('')
  }

  return (
    <div className="min-h-screen bg-[#0d1529] flex flex-col items-center justify-start pt-16 px-4">
      <div className="w-full max-w-lg">
        <p className="text-xs font-semibold text-[#c9a84c] tracking-widest uppercase text-center mb-2">Manta Shark Aquatics</p>
        <h1 className="text-3xl font-bold text-white text-center mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>QR Check-in</h1>
        <p className="text-white/40 text-center text-sm mb-8">輸入學生或家長姓名進行 check-in</p>

        <div className="bg-[#111d38] rounded-2xl p-6 mb-4">
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setResult(null) }}
            placeholder="輸入學生姓名或家長姓名..."
            className="w-full bg-[#1a2744] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#c9a84c] text-sm transition-colors"
            autoFocus
          />

          {filtered.length > 0 && (
            <div className="mt-3 space-y-2">
              {filtered.map(s => {
                const parent = Array.isArray(s.parents) ? s.parents[0] : s.parents
                return (
                  <button
                    key={s.id}
                    onClick={() => checkin(s)}
                    disabled={loading === s.id}
                    className="w-full flex items-center justify-between bg-[#1a2744] hover:bg-[#c9a84c]/10 border border-white/10 hover:border-[#c9a84c]/40 rounded-xl px-4 py-3 transition-all disabled:opacity-50"
                  >
                    <div className="text-left">
                      <p className="text-white font-medium text-sm">{s.full_name}</p>
                      <p className="text-white/40 text-xs">{parent?.first_name} {parent?.last_name}</p>
                    </div>
                    <span className="text-[#c9a84c] text-sm font-semibold">
                      {loading === s.id ? '處理中...' : 'Check-in'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {query.trim().length >= 1 && filtered.length === 0 && (
            <p className="text-white/30 text-sm text-center mt-4">找不到符合的學生</p>
          )}
        </div>

        {result && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium text-center ${result.success ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
            {result.message}
          </div>
        )}
      </div>
    </div>
  )
}
