import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { cleanLook, defaultLook } from '@/lib/swimmer-look'

export const runtime = 'nodejs'

/* The app's 3D swimmer (owner, 2026-10-29; lib/swimmer-look.ts).
 *
 * { student_id, look }   saves how the swimmer is dressed.
 * { student_id, style }  answers the card's "a boy's or a girl's look?" for a
 *                        swimmer with no look and no gender on file: it saves
 *                        that starting look. It never writes students.gender
 *                        (owner, 2026-10-29: gender is optional, and the look
 *                        is not a statement about the child).
 *
 * Anyone in the family may do either -- view-only members too (owner: it costs
 * nothing and touches no lesson or payment). The swimmer must be the family's. */
export async function POST(req: NextRequest) {
  const ctx = await requireParent({ viewer: true })
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = ctx

  const body = await req.json().catch(() => null) as { student_id?: unknown; look?: unknown; style?: unknown; gender?: unknown } | null
  const studentId = typeof body?.student_id === 'string' ? body.student_id : ''
  if (!studentId) return NextResponse.json({ error: 'Missing swimmer' }, { status: 400 })

  const { data: student } = await svc.from('students').select('id, parent_id, is_active')
    .eq('id', studentId).maybeSingle()
  if (!student || student.parent_id !== parent.id || !student.is_active) {
    return NextResponse.json({ error: 'Swimmer not found' }, { status: 404 })
  }

  // A page opened before 2026-10-29 sends { gender: 'male' | 'female' }: read as a style.
  const style = body?.style ?? body?.gender
  const start = style === 'boy' || style === 'male' ? defaultLook(studentId, 'male')
    : style === 'girl' || style === 'female' ? defaultLook(studentId, 'female') : null
  if (style !== undefined && !start) return NextResponse.json({ error: 'Choose a look', code: 'STYLE' }, { status: 400 })

  const look = start ?? cleanLook(body?.look)
  if (!look) return NextResponse.json({ error: 'That look is not one we offer', code: 'LOOK' }, { status: 400 })
  const { error } = await svc.from('students').update({ avatar_look: look }).eq('id', studentId)
  if (error) {
    // Most likely docs/migration-swimmer-look.sql has not been run yet.
    console.error('[swimmer-look] look not saved', error)
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
  }
  // The older page waits for `gender` to draw the swimmer; it is only kept on that page, never stored.
  const legacy = body?.gender !== undefined && start ? { gender: start.gender === 'boy' ? 'male' : 'female' } : {}
  return NextResponse.json({ ok: true, look, ...legacy })
}
