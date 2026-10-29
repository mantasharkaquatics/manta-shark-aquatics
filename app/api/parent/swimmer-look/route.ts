import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { cleanLook, defaultLook, isGender } from '@/lib/swimmer-look'

export const runtime = 'nodejs'

/* The app's 3D swimmer (owner, 2026-10-29; lib/swimmer-look.ts).
 *
 * { student_id, look }   saves how the swimmer is dressed.
 * { student_id, gender } answers the card's "boy or girl?" for a swimmer the
 *                        school has no gender for; it fills students.gender
 *                        only while that is empty, and the card starts from it.
 *
 * Anyone in the family may do either -- view-only members too (owner: it costs
 * nothing and touches no lesson or payment). The swimmer must be the family's. */
export async function POST(req: NextRequest) {
  const ctx = await requireParent({ viewer: true })
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = ctx

  const body = await req.json().catch(() => null) as { student_id?: unknown; look?: unknown; gender?: unknown } | null
  const studentId = typeof body?.student_id === 'string' ? body.student_id : ''
  if (!studentId) return NextResponse.json({ error: 'Missing swimmer' }, { status: 400 })

  const { data: student } = await svc.from('students').select('id, parent_id, is_active, gender')
    .eq('id', studentId).maybeSingle()
  if (!student || student.parent_id !== parent.id || !student.is_active) {
    return NextResponse.json({ error: 'Swimmer not found' }, { status: 404 })
  }

  if (body?.gender !== undefined) {
    if (!isGender(body.gender)) return NextResponse.json({ error: 'Choose boy or girl', code: 'GENDER' }, { status: 400 })
    // Never overwrite what the family or the desk already said.
    const gender = isGender(student.gender) ? student.gender : body.gender
    if (!isGender(student.gender)) {
      const { error } = await svc.from('students').update({ gender }).eq('id', studentId).is('gender', null)
      if (error) {
        console.error('[swimmer-look] gender not saved', error)
        return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
      }
    }
    return NextResponse.json({ ok: true, gender, look: defaultLook(studentId, gender) })
  }

  const look = cleanLook(body?.look)
  if (!look) return NextResponse.json({ error: 'That look is not one we offer', code: 'LOOK' }, { status: 400 })
  const { error } = await svc.from('students').update({ avatar_look: look }).eq('id', studentId)
  if (error) {
    // Most likely docs/migration-swimmer-look.sql has not been run yet.
    console.error('[swimmer-look] look not saved', error)
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, look })
}
