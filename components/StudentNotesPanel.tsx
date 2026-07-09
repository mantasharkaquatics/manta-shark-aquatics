'use client'

import { useState, useEffect, useCallback } from 'react'

type Note = { id: string; content: string; pinned: boolean; created_at: string; author: string }

export default function StudentNotesPanel({ studentId, collapsible = false, onCountChange }: {
  studentId: string
  collapsible?: boolean
  onCountChange?: (count: number) => void
}) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [open, setOpen] = useState(!collapsible)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/student-notes?student_id=${studentId}`)
      const d = await res.json()
      const list: Note[] = d.notes || []
      setNotes(list)
      onCountChange?.(list.length)
    } catch {
      setNotes([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  useEffect(() => { load() }, [load])

  async function addNote() {
    const content = draft.trim()
    if (!content || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/student-notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: studentId, content }) })
      if (res.ok) { setDraft(''); setComposing(false); await load() }
    } finally { setBusy(false) }
  }

  async function saveNote(noteId: string) {
    const content = editDraft.trim()
    if (!content || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/student-notes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: noteId, content }) })
      if (res.ok) { setEditingId(null); await load() }
    } finally { setBusy(false) }
  }

  async function togglePin(noteId: string, pinned: boolean) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/student-notes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: noteId, pinned: !pinned }) })
      if (res.ok) await load()
    } finally { setBusy(false) }
  }

  async function deleteNote(noteId: string) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/student-notes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: noteId }) })
      if (res.ok) { setDeletingId(null); await load() }
    } finally { setBusy(false) }
  }

  const count = notes?.length ?? 0

  return (
    <div>
      {collapsible && (
        <button onClick={() => setOpen(o => !o)}
          className={`text-xs px-2 py-1 rounded-full border transition-all ${open ? 'border-emerald-400 bg-emerald-400/20 text-emerald-300' : count > 0 ? 'border-[#c9a84c]/50 text-[#c9a84c] hover:bg-[#c9a84c]/10' : 'border-white/10 text-gray-500 hover:border-emerald-400/40'}`}>
          📝 Notes{notes === null ? '' : ` (${count})`}
        </button>
      )}
      {open && (
        <div className={collapsible ? 'mt-2' : ''}>
          {composing ? (
            <div className="mb-2 bg-[#0d1529] border border-[#c9a84c]/40 rounded-lg p-3">
              <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} autoFocus
                onBlur={() => { if (!draft.trim()) { setComposing(false); setDraft('') } }}
                placeholder="Write a note (visible to admins only)..."
                className="w-full bg-transparent text-sm text-white placeholder-gray-600 resize-none focus:outline-none" />
              <div className="flex items-center gap-3 mt-2">
                <button onClick={addNote} disabled={busy || !draft.trim()}
                  className="px-4 py-1.5 rounded-lg bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] text-sm font-semibold disabled:opacity-40 transition-all">Done</button>
                <button onClick={() => { setComposing(false); setDraft('') }}
                  className="px-4 py-1.5 rounded-lg border border-white/15 text-gray-400 hover:text-white hover:border-white/30 text-sm transition-all">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setComposing(true); setDraft('') }}
              className="mb-2 text-sm text-[#c9a84c] hover:text-[#b8963e] font-semibold transition-colors">+ Add Note</button>
          )}
          {notes === null ? (
            <p className="text-gray-500 text-xs py-1">Loading...</p>
          ) : notes.length === 0 ? (
            <p className="text-gray-600 text-xs py-1">No notes yet.</p>
          ) : (
            <div className="space-y-1.5">
              {notes.map(n => (
                <div key={n.id} className="group flex items-start gap-2 bg-[#0d1529] rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    {editingId === n.id ? (
                      <div className="bg-[#111d38] border border-[#c9a84c]/40 rounded-lg p-3">
                        <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={2} autoFocus
                          className="w-full bg-transparent text-sm text-white resize-none focus:outline-none" />
                        <div className="flex items-center gap-3 mt-2">
                          <button onClick={() => saveNote(n.id)} disabled={busy || !editDraft.trim()}
                            className="px-4 py-1.5 rounded-lg bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] text-sm font-semibold disabled:opacity-40 transition-all">Save</button>
                          <button onClick={() => setEditingId(null)}
                            className="px-4 py-1.5 rounded-lg border border-white/15 text-gray-400 hover:text-white hover:border-white/30 text-sm transition-all">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-gray-200 text-sm whitespace-pre-wrap">{n.pinned && <span className="mr-1">📌</span>}{n.content}</p>
                        <p className="text-gray-500 text-xs mt-1">{new Date(n.created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} · {n.author}</p>
                      </>
                    )}
                  </div>
                  {editingId !== n.id && (
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {deletingId === n.id ? (
                        <>
                          <span className="text-gray-400 text-xs">Delete?</span>
                          <button onClick={() => deleteNote(n.id)} disabled={busy}
                            className="px-2 py-0.5 rounded-full border border-red-400 bg-red-500/20 text-red-300 text-xs font-semibold">Yes</button>
                          <button onClick={() => setDeletingId(null)}
                            className="px-2 py-0.5 rounded-full border border-gray-700 text-gray-500 text-xs font-semibold">No</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => togglePin(n.id, n.pinned)} title={n.pinned ? 'Unpin' : 'Pin'}
                            className={`px-2 py-1 rounded text-base transition-colors ${n.pinned ? 'text-[#c9a84c]' : 'text-gray-500 hover:text-[#c9a84c]'}`}>📌</button>
                          <button onClick={() => { setEditingId(n.id); setEditDraft(n.content); setDeletingId(null) }} title="Edit"
                            className="px-2 py-1 rounded text-base text-gray-500 hover:text-[#c9a84c] transition-colors">✏️</button>
                          <button onClick={() => setDeletingId(n.id)} title="Delete"
                            className="px-2 py-1 rounded text-base text-gray-500 hover:text-red-400 transition-colors">🗑</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
