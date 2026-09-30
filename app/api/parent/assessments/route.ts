import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { assessmentsForParent } from '@/lib/assessments'
import { toLocale } from '@/lib/i18n'

export const runtime = 'nodejs'

// The family's Swim Assessment reports and their credit progress, for the
// dashboard's student cards. ?lang= is the language the page is being read in:
// the coach's note and the recommendation line come back in it.
export async function GET(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    const lang = toLocale(req.nextUrl.searchParams.get('lang'))
    const reports = await assessmentsForParent(ctx.svc, ctx.parent.id, lang)
    return NextResponse.json({ reports })
  } catch (e) {
    console.error('parent/assessments failed:', e)
    return NextResponse.json({ error: 'Could not load the assessment reports' }, { status: 500 })
  }
}
