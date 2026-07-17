import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getCancellationQuota } from '@/lib/tokens'

// Parent-facing token data. token_packages has RLS with zero client policies,
// so all reads go through this service-role route (ownership verified here).
export async function GET() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await svc
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Parent not found' }, { status: 403 })

  const nowIso = new Date().toISOString()
  const { data: packs, error: packErr } = await svc
    .from('token_packages')
    .select('id, course_type_id, total_tokens, used_tokens, expires_at, source, created_at')
    .eq('parent_id', parent.id)
    .gt('expires_at', nowIso)
    .order('expires_at', { ascending: true })
  if (packErr) return NextResponse.json({ error: 'DB error' }, { status: 500 })

  const active = (packs || []).filter(p => p.used_tokens < p.total_tokens)

  // Two-step join (Supabase nested joins silently fail in prod)
  const ctIds = Array.from(new Set(active.map(p => p.course_type_id)))
  let ctNames: Record<string, string> = {}
  if (ctIds.length > 0) {
    const { data: cts } = await svc.from('course_types').select('id, name').in('id', ctIds)
    for (const c of cts || []) ctNames[c.id] = c.name
  }

  const quota = await getCancellationQuota(svc, parent.id)

  return NextResponse.json({
    tokens: active.map(p => ({
      id: p.id,
      course_type_id: p.course_type_id,
      course_name: ctNames[p.course_type_id] || '',
      remaining: p.total_tokens - p.used_tokens,
      expires_at: p.expires_at,
      source: p.source,
    })),
    quota,
  })
}
