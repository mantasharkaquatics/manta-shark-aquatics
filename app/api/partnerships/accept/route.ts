import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { readJson, badRequest } from '@/lib/http'
import { takeSlots, releaseSlot, ipHash, keyHash } from '@/lib/ip-rate-limit'
import { inviteCodeExpired, inviteCodeCutoffIso } from '@/lib/partnerships'

/* Guessing codes (found 2026-10-15): any signed-in parent could try invite
   codes as fast as they liked, and a hit links them to a stranger family and
   shows them that family's children. Wrong guesses are now counted per family
   and per network; a code that works gives its attempt back. */
const MAX_FAILED_PER_PARENT_PER_HOUR = 10
const MAX_FAILED_PER_IP_PER_HOUR = 20

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest()
  const invite_code = typeof body.invite_code === 'string' ? body.invite_code.trim() : ''
  if (!invite_code) return NextResponse.json({ error: 'Missing invite_code' }, { status: 400 })

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

  const { data: parent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Parent not found' }, { status: 404 })

  const slots = await takeSlots(supabase, [
    { scope: 'partnership-accept-parent', key: keyHash('parent', parent.id), max: MAX_FAILED_PER_PARENT_PER_HOUR, windowMs: 60 * 60 * 1000 },
    { scope: 'partnership-accept', key: ipHash(req), max: MAX_FAILED_PER_IP_PER_HOUR, windowMs: 60 * 60 * 1000 },
  ])
  if (slots.result === 'error')
    return NextResponse.json({ error: 'Could not check the invite code. Please try again.' }, { status: 500 })
  if (slots.result === 'limited')
    return NextResponse.json({ error: 'Too many invite codes tried. Please try again in an hour.' }, { status: 429 })
  const giveBack = async () => { for (const id of slots.ids) await releaseSlot(supabase, id) }

  const { data: partnership } = await supabase
    .from('parent_partnerships')
    .select('id, initiator_parent_id, status, created_at')
    .eq('invite_code', invite_code.toUpperCase())
    .eq('status', 'pending')
    .single()

  if (!partnership) return NextResponse.json({ error: 'Invite code is invalid or expired' }, { status: 404 })
  if (partnership.initiator_parent_id === parent.id)
    return NextResponse.json({ error: 'You cannot use your own invite code' }, { status: 400 })
  // Older than INVITE_CODE_DAYS (owner 2026-10-16, audit F68). Its own answer,
  // so the parent knows to ask for a new code rather than retype this one, and
  // it says nothing about the family the code belongs to. Like a wrong code it
  // keeps the attempt it took above: an old code is no free guess.
  if (inviteCodeExpired(partnership.created_at))
    return NextResponse.json({ error: 'This invite code has expired. Ask the other family to share a new one.', code: 'code_expired' }, { status: 410 })

  // Ensure no existing link
  const { data: existingPartnership } = await supabase
    .from('parent_partnerships')
    .select('id')
    .or(`and(initiator_parent_id.eq.${parent.id},partner_parent_id.eq.${partnership.initiator_parent_id}),and(initiator_parent_id.eq.${partnership.initiator_parent_id},partner_parent_id.eq.${parent.id})`)
    .eq('status', 'active')
    .maybeSingle()

  if (existingPartnership)
    return NextResponse.json({ error: 'These accounts are already linked' }, { status: 400 })

  // Only while the code is still pending (found 2026-10-05): two parents
  // entering the same code at once both passed the read above, and the second
  // update overwrote the first family's link. Now only one update can match.
  const { data: claimed, error } = await supabase
    .from('parent_partnerships')
    .update({
      partner_parent_id: parent.id,
      status: 'active',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', partnership.id)
    .eq('status', 'pending')
    // Still the code that was entered: the owner may have been given a fresh
    // one for this row (/api/partnerships/invite) since the read above.
    .eq('invite_code', invite_code.toUpperCase())
    // Still in date at the moment of the claim, not only at the read above.
    .gt('created_at', inviteCodeCutoffIso())
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Someone else used the code first: to this parent it is no longer valid.
  if (!claimed || claimed.length === 0)
    return NextResponse.json({ error: 'Invite code is invalid or expired' }, { status: 409 })
  await giveBack()
  return NextResponse.json({ success: true })
}
