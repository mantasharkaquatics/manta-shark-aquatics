'use client'

import { useState } from 'react'

type Note = {
  id: string
  studentName: string
  studentLevel: string
  coachName: string
  sessionDate: string
  startTime: string
  courseName: string
  minutes: number
  language: string
  status: string
  transcript: string
  note: string
  audioSeconds: number | null
  audioUrl: string | null
}

const fmtTime = (t: string) => {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-US',
    { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function LessonNotesClient({ notes: initial }: { notes: Note[] }) {
  const [notes, setNotes] = useState(initial)
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.find(n => n.status === 'pending_review')?.id ?? initial[0]?.id ?? null
  )
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const selected = notes.find(n => n.id === selectedId) || null
  const pendingCount = notes.filter(n => n.status === 'pending_review').length

  const open = (n: Note) => {
    setSelectedId(n.id)
    setDraft(n.note)
    setError('')
  }

  // The textarea starts from whatever is on the selected note.
  const body = selected ? (selectedId && draft !== '' ? draft : selected.note) : ''

  const send = async (action: 'approve' | 'reject') => {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/lesson-notes', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: selected.id, note: body, action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not save')
      setNotes(prev => prev.map(n =>
        n.id === selected.id
          ? { ...n, note: body, status: action === 'approve' ? 'approved' : 'rejected' }
          : n
      ))
    } catch (err: any) {
      setError(err?.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const badge = (status: string) =>
    status === 'pending_review' ? 'bg-[#c9a84c]/20 text-[#c9a84c]'
    : status === 'approved' ? 'bg-green-500/20 text-green-400'
    : 'bg-red-500/20 text-red-400'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Lesson Notes</h1>
        <p className="text-gray-400 mt-1 text-sm">
          {pendingCount > 0
            ? `${pendingCount} waiting for review — families see nothing until you approve.`
            : 'Nothing waiting. Approved notes are visible to families.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* List */}
        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
          {notes.length === 0 && (
            <div className="bg-[#111d38] rounded-xl p-8 text-center border border-[#1e3a6e]">
              <p className="text-gray-400 text-sm">No lesson notes yet.</p>
            </div>
          )}
          {notes.map(n => (
            <button
              key={n.id}
              onClick={() => open(n)}
              className={`w-full text-left bg-[#111d38] rounded-xl p-4 border transition-all ${
                selectedId === n.id ? 'border-[#c9a84c]' : 'border-[#1e3a6e] hover:border-[#c9a84c]/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-white font-semibold text-sm">{n.studentName}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${badge(n.status)}`}>
                  {n.status === 'pending_review' ? 'WAITING' : n.status.toUpperCase()}
                </span>
              </div>
              <p className="text-gray-400 text-xs">
                {fmtDate(n.sessionDate)} · {fmtTime(n.startTime)} · {n.minutes} min
              </p>
              <p className="text-gray-500 text-xs mt-1 line-clamp-2">{n.note}</p>
            </button>
          ))}
        </div>

        {/* Detail */}
        {!selected ? (
          <div className="bg-[#111d38] rounded-xl p-8 text-center border border-[#1e3a6e]">
            <p className="text-gray-400">Pick a note from the list.</p>
          </div>
        ) : (
          <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] overflow-hidden">
            <div className="p-5 border-b border-[#1e3a6e]">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-white font-semibold">
                    {selected.studentName}
                    <span className="text-gray-400 font-normal text-sm"> · Level {selected.studentLevel}</span>
                  </p>
                  <p className="text-gray-400 text-sm">
                    {selected.courseName} · {fmtDate(selected.sessionDate)} · {fmtTime(selected.startTime)} · {selected.minutes} min
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Coach {selected.coachName} · recorded in {selected.language === 'zh' ? '中文' : 'English'}
                    {selected.audioSeconds ? ` · ${selected.audioSeconds}s` : ''}
                  </p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full ${badge(selected.status)}`}>
                  {selected.status === 'pending_review' ? 'WAITING' : selected.status.toUpperCase()}
                </span>
              </div>

              {selected.audioUrl && (
                <audio controls src={selected.audioUrl} className="w-full mt-4" />
              )}
            </div>

            <div className="p-5 space-y-4">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">
                  What the coach said
                </p>
                {/* Read-only on purpose: it is the record of what was actually
                    spoken, and it is the thing to compare against when the
                    written note reads oddly. */}
                <div className="bg-[#0d1529] rounded-lg p-4 border border-[#1e3a6e]">
                  <p className="text-gray-300 text-sm whitespace-pre-wrap">
                    {selected.transcript || '—'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">
                  What the family will read
                </p>
                <textarea
                  value={body}
                  onChange={e => setDraft(e.target.value)}
                  rows={7}
                  className="w-full bg-[#0d1529] text-white text-sm rounded-lg p-4 border border-[#1e3a6e] focus:border-[#c9a84c] outline-none resize-y"
                />
                <p className="text-gray-500 text-xs mt-1">
                  Edit freely. Anything the coach did not actually say is worth cutting.
                </p>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => send('reject')}
                  disabled={busy}
                  className="px-5 bg-[#1e3a6e] hover:bg-[#2a4d8f] disabled:opacity-50 text-white font-semibold py-3 rounded-lg text-sm"
                >
                  Reject
                </button>
                <button
                  onClick={() => send('approve')}
                  disabled={busy}
                  className="flex-1 bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] font-semibold py-3 rounded-lg text-sm"
                >
                  {busy ? 'Saving…' : selected.status === 'approved' ? 'Save changes' : 'Approve & publish'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
