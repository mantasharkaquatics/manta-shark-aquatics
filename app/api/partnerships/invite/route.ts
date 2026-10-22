import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { randomInt } from 'crypto'
import { inviteCodeExpired, inviteCodeExpiresAt } from '@/lib/partnerships'
import { familyOf } from '@/lib/api-auth'

// crypto, not Math.random (found 2026-10-15): the code is what lets a family
// link to this one, so it should not come from a guessable generator.
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'MSA-'
  for (let i = 0; i < 6; i++) code += chars[randomInt(chars.length)]
  return code
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await familyOf(supabase, user.id, 'id')
  if (!parent) return NextResponse.json({ error: 'Parent not found' }, { status: 404 })

  const answer = (row: { invite_code: string; created_at: string | null }) => NextResponse.json({
    invite_code: row.invite_code,
    expires_at: inviteCodeExpiresAt(row.created_at)?.toISOString() ?? null,
  })

  // Check for an existing pending invite code. The newest one, not
  // maybeSingle: with two pending rows that read errored, came back empty and
  // a third row was added on every visit.
  const { data: pendingRows, error: readErr } = await supabase
    .from('parent_partnerships')
    .select('id, invite_code, created_at')
    .eq('initiator_parent_id', parent.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
  if (readErr) return NextResponse.json({ error: 'Could not load your invite code. Please try again.' }, { status: 500 })
  const existing = pendingRows?.[0] ?? null

  if (existing && !inviteCodeExpired(existing.created_at)) return answer(existing)

  // Generate a unique invite code
  let code = generateCode()
  let attempts = 0
  while (attempts < 10) {
    const { data: conflict } = await supabase
      .from('parent_partnerships').select('id').eq('invite_code', code).maybeSingle()
    if (!conflict) break
    code = generateCode()
    attempts++
  }

  // A code past INVITE_CODE_DAYS (owner 2026-10-16, audit F68) is replaced in
  // its own row: new code, created_at restarted. The pending row is only a
  // holder for this family's current code (partner_parent_id is a placeholder
  // until someone accepts), so nothing else refers to it, and keeping one row
  // keeps the one-pending-code-per-family shape the read above relies on.
  // The old code then matches no row, so accept calls it invalid. Only if the
  // row still holds the old code: a second tab doing the same at once gets
  // the code the first one made.
  if (existing) {
    const { data: renewed, error: renewErr } = await supabase
      .from('parent_partnerships')
      .update({ invite_code: code, created_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('status', 'pending')
      .eq('invite_code', existing.invite_code)
      .select('invite_code, created_at')
    if (renewErr) return NextResponse.json({ error: renewErr.message }, { status: 500 })
    if (renewed && renewed.length > 0) return answer(renewed[0])
    const { data: current } = await supabase
      .from('parent_partnerships').select('invite_code, created_at, status')
      .eq('id', existing.id).maybeSingle()
    if (current && current.status === 'pending' && !inviteCodeExpired(current.created_at)) return answer(current)
    return NextResponse.json({ error: 'Could not load your invite code. Please try again.' }, { status: 409 })
  }

  const { data: partnership, error } = await supabase
    .from('parent_partnerships')
    .insert({
      initiator_parent_id: parent.id,
      partner_parent_id: parent.id, // placeholder, will be updated on accept
      invite_code: code,
      status: 'pending',
    })
    .select('invite_code, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return answer(partnership)
}
