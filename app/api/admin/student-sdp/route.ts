import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { student_id, legal_full_name, uci_number, service_code } = await req.json()
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 })

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await svc
    .from('students')
    .update({
      legal_full_name: legal_full_name?.trim() || null,
      uci_number: uci_number?.trim() || null,
      service_code: service_code?.trim() || null,
    })
    .eq('id', student_id)
  if (error) {
    console.error('student-sdp update error:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
