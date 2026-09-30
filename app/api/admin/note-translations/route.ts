import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { refreshNoteTranslations } from '@/lib/ai/translate-note'
import { detectNoteLanguage, SUPPORTED_NOTE_LANGUAGES } from '@/lib/ai/models'

export const runtime = 'nodejs'
// A repair run translates each broken note into two languages, about two model
// calls a note. Give it room.
export const maxDuration = 60

// Approved lesson notes a family could be reading in the wrong language: one
// missing a translation, or one whose stored language no longer matches the
// text that was approved (an admin rewrote it in the other language). Read on
// the Reviews page, which offers to repair them.
async function brokenNotes(svc: any): Promise<string[]> {
  const { data: notes } = await svc.from('lesson_notes')
    .select('id, language, note').eq('status', 'approved')
  const ids = (notes || []).map((n: any) => n.id)
  if (ids.length === 0) return []
  const { data: trans } = await svc.from('lesson_note_translations')
    .select('lesson_note_id, language').in('lesson_note_id', ids)
  const have = new Map<string, Set<string>>()
  for (const t of trans || []) {
    if (!have.has(t.lesson_note_id)) have.set(t.lesson_note_id, new Set())
    have.get(t.lesson_note_id)!.add(t.language)
  }
  const out: string[] = []
  for (const n of notes || []) {
    const text = String(n.note || '').trim()
    if (!text) continue
    const stored = n.language || 'en'
    const detected = detectNoteLanguage(text, stored)
    const source = detected === 'zh-Hant' && stored === 'zh-Hans' ? 'zh-Hans' : detected
    const got = have.get(n.id) || new Set<string>()
    const missing = SUPPORTED_NOTE_LANGUAGES.some(l => l !== source && !got.has(l))
    if (source !== stored || missing) out.push(n.id)
  }
  return out
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ids = await brokenNotes(auth.svc)
  return NextResponse.json({ count: ids.length })
}

export async function POST() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ids = await brokenNotes(auth.svc)
  let fixed = 0
  for (const id of ids) {
    const { failed } = await refreshNoteTranslations(auth.svc, id)
    if (failed.length === 0) fixed++
  }
  const left = (await brokenNotes(auth.svc)).length
  return NextResponse.json({ ok: true, tried: ids.length, fixed, left })
}
