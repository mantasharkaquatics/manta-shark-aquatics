import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { refreshNoteTranslations } from '@/lib/ai/translate-note'
import { detectNoteLanguage, SUPPORTED_NOTE_LANGUAGES } from '@/lib/ai/models'
import { allRows, allRowsIn } from '@/lib/db-paging'

export const runtime = 'nodejs'
// A repair run translates each broken note into two languages, about two model
// calls a note. Give it room.
export const maxDuration = 60

// Approved lesson notes a family could be reading in the wrong language: one
// missing a translation, or one whose stored language no longer matches the
// text that was approved (an admin rewrote it in the other language). Read on
// the Reviews page, which offers to repair them.
//
// Both reads are paged, and the translations are read in id chunks: past
// ~500 notes the translation table passed 1,000 rows, and the rows cut off
// made already-translated notes look missing -- the page kept offering to
// "fix" them, and every press paid to translate them again (found
// 2026-10-08). A failed read is an error, never "everything is missing".
async function brokenNotes(svc: any): Promise<{ ids: string[]; error: string | null }> {
  const { data: notes, error: notesErr } = await allRows(() => svc.from('lesson_notes')
    .select('id, language, note').eq('status', 'approved').order('id'))
  if (notesErr) return { ids: [], error: notesErr.message || String(notesErr) }
  const ids = notes.map((n: any) => n.id)
  if (ids.length === 0) return { ids: [], error: null }
  const { data: trans, error: transErr } = await allRowsIn(ids, c => svc.from('lesson_note_translations')
    .select('lesson_note_id, language').in('lesson_note_id', c).order('lesson_note_id').order('language'))
  if (transErr) return { ids: [], error: transErr.message || String(transErr) }
  const have = new Map<string, Set<string>>()
  for (const t of trans) {
    if (!have.has(t.lesson_note_id)) have.set(t.lesson_note_id, new Set())
    have.get(t.lesson_note_id)!.add(t.language)
  }
  const out: string[] = []
  for (const n of notes) {
    const text = String(n.note || '').trim()
    if (!text) continue
    const stored = n.language || 'en'
    const detected = detectNoteLanguage(text, stored)
    const source = detected === 'zh-Hant' && stored === 'zh-Hans' ? 'zh-Hans' : detected
    const got = have.get(n.id) || new Set<string>()
    const missing = SUPPORTED_NOTE_LANGUAGES.some(l => l !== source && !got.has(l))
    if (source !== stored || missing) out.push(n.id)
  }
  return { ids: out, error: null }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { ids, error } = await brokenNotes(auth.svc)
  if (error) {
    console.error('note-translations: read failed:', error)
    return NextResponse.json({ error: 'Could not check the translations' }, { status: 500 })
  }
  return NextResponse.json({ count: ids.length })
}

// One press repairs a batch, inside the time limit; the button says how many
// are left, and pressing again carries on.
const BATCH = 20
const BUDGET_MS = 40_000

export async function POST() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const started = Date.now()
  const { ids, error } = await brokenNotes(auth.svc)
  if (error) {
    console.error('note-translations: read failed:', error)
    return NextResponse.json({ error: 'Could not check the translations' }, { status: 500 })
  }
  let fixed = 0
  let tried = 0
  for (const id of ids.slice(0, BATCH)) {
    if (Date.now() - started > BUDGET_MS) break
    tried++
    const { failed } = await refreshNoteTranslations(auth.svc, id)
    if (failed.length === 0) fixed++
  }
  const after = await brokenNotes(auth.svc)
  const left = after.error ? Math.max(0, ids.length - fixed) : after.ids.length
  return NextResponse.json({ ok: true, tried, fixed, left })
}
