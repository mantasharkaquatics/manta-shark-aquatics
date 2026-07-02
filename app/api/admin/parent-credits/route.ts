import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = auth.svc
  const parentId = req.nextUrl.searchParams.get('parent_id')
  const courseTypeId = req.nextUrl.searchParams.get('course_type_id')

  if (!parentId || !courseTypeId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('lesson_credits')
    .select('id, used_credits, total_credits')
    .eq('parent_id', parentId)
    .eq('course_type_id', courseTypeId)
    .order('expires_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
