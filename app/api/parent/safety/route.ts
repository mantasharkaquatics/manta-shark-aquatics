import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { contactProblem, medicalToStore } from '@/lib/safety-info'
import { readSafety, saveContact, saveMedical } from '@/lib/safety-info-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* A family's safety information (owner, 2026-10-22): each swimmer's medical
   conditions / allergies, and one emergency contact. lib/safety-info.ts.

   GET   what is on file, and whether anything is still missing
   POST  { contact?: {name, relation, phone}, students?: [{id, none, notes}] }
         saves what is sent; every part is checked before anything is written. */

export async function GET() {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const info = await readSafety(ctx.svc, ctx.parent.id)
  if (!info) return NextResponse.json({ error: 'Could not load' }, { status: 500 })
  return NextResponse.json(info)
}

export async function POST(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = ctx
  const body = await req.json().catch(() => null) as { contact?: any; students?: any[] } | null
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  if (body.contact !== undefined) {
    const { data: me } = await svc.from('parents').select('phone').eq('id', parent.id).maybeSingle()
    const problem = contactProblem(body.contact, me?.phone)
    if (problem) return NextResponse.json({ error: 'Invalid emergency contact', code: 'CONTACT_' + problem.toUpperCase() }, { status: 400 })
  }
  const answers: { id: string; notes: string | null }[] = []
  if (Array.isArray(body.students)) {
    const { data: mine } = await svc.from('students').select('id').eq('parent_id', parent.id).eq('is_active', true)
    const own = new Set((mine || []).map((s: { id: string }) => s.id))
    for (const s of body.students) {
      if (!s || typeof s.id !== 'string' || !own.has(s.id)) return NextResponse.json({ error: 'Unknown swimmer', code: 'STUDENT' }, { status: 400 })
      const stored = medicalToStore(s)
      if (stored === undefined) return NextResponse.json({ error: 'Answer the medical question for every swimmer', code: 'MEDICAL', id: s.id }, { status: 400 })
      answers.push({ id: s.id, notes: stored })
    }
  }

  let ok = true
  if (body.contact !== undefined) ok = (await saveContact(svc, parent.id, body.contact)) && ok
  for (const a of answers) ok = (await saveMedical(svc, parent.id, a.id, a.notes)) && ok
  if (!ok) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
  const info = await readSafety(svc, parent.id)
  return NextResponse.json({ ok: true, ...(info || {}) })
}
