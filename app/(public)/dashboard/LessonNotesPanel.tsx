'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const GOLD = '#c9a84c'

type Note = {
  id: string
  session_date: string
  note: string
}

// Self-fetching on purpose: the dashboard's own loader is already long, and
// RLS (parents_read_approved_notes) means this can only ever return this
// family's approved notes anyway.
export default function LessonNotesPanel({ studentId }: { studentId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('lesson_notes')
      .select('id, session_date, note')
      .eq('student_id', studentId)
      .eq('status', 'approved')
      .order('session_date', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('lesson notes: could not load', error)
        setNotes((data as Note[]) || [])
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [studentId])

  // Nothing approved yet means nothing to show. An empty box would only make a
  // parent wonder what they are missing.
  if (!loaded || notes.length === 0) return null

  return (
    <div style={{ marginTop: '12px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '10px 14px',
          borderRadius: '10px', border: `1px solid ${GOLD}55`,
          background: 'transparent', color: GOLD,
          fontSize: '12px', fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          letterSpacing: '0.5px',
        }}
      >
        <span>📝 Lesson Notes ({notes.length})</span>
        <span style={{ fontSize: '10px' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {notes.map(n => (
            <div
              key={n.id}
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{ fontSize: '11px', color: GOLD, fontWeight: 700, marginBottom: '4px' }}>
                {n.session_date}
              </div>
              <div style={{
                fontSize: '12px', color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {n.note}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
