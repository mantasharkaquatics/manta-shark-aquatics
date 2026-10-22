import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getAuthUser() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  return user
}

export async function requireUser() {
  const user = await getAuthUser()
  if (!user) return null
  return { user, svc: serviceClient() }
}

export async function requireAdmin() {
  const user = await getAuthUser()
  if (!user) return null
  const svc = serviceClient()
  const { data: admin } = await svc
    .from('admins').select('id, first_name, last_name').eq('auth_user_id', user.id).single()
  if (!admin) return null
  return { user, admin, svc }
}

/* The family a signed-in person belongs to: as its main account (parents.
   auth_user_id) or as a live second guardian (parent_guardians, owner
   2026-10-22: same rights as the main account). Returns the parents row with
   the columns asked for, shaped like a supabase read so call sites can swap
   `.from('parents')...eq('auth_user_id', id).single()` for it. `guardianId` is
   set when the person is a guardian, not the main account. Before
   docs/migration-guardians.sql runs, the guardian read fails and only main
   accounts resolve, as before. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function familyOf(svc: any, authUserId: string, cols = 'id'): Promise<{ data: any | null; guardianId: string | null }> {
  const { data: own } = await svc.from('parents').select(cols).eq('auth_user_id', authUserId).maybeSingle()
  if (own) return { data: own, guardianId: null }
  const { data: g, error } = await svc.from('parent_guardians').select('id, parent_id')
    .eq('auth_user_id', authUserId).is('removed_at', null).maybeSingle()
  if (error || !g) return { data: null, guardianId: null }
  const { data: fam } = await svc.from('parents').select(cols).eq('id', g.parent_id).maybeSingle()
  return { data: fam || null, guardianId: fam ? g.id : null }
}

export async function requireParent() {
  const user = await getAuthUser()
  if (!user) return null
  const svc = serviceClient()
  const { data: parent, guardianId } = await familyOf(svc, user.id, 'id, email, first_name')
  if (!parent) return null
  return { user, parent: parent as { id: string; email: string | null; first_name: string | null }, svc, guardianId }
}

// is_active is the off-boarding switch. The PIN login has always honoured it,
// but that only stops a NEW sign-in: a coach who left with a live session, or
// who knows the password on their auth user, kept every coach route. Checking
// it here revokes on the next request instead of whenever the session expires.
export async function requireCoach() {
  const user = await getAuthUser()
  if (!user) return null
  const svc = serviceClient()
  const { data: coach } = await svc
    .from('coaches').select('id, first_name').eq('auth_user_id', user.id)
    .eq('is_active', true).single()
  if (!coach) return null
  return { user, coach, svc }
}

export async function requireStaff() {
  const user = await getAuthUser()
  if (!user) return null
  const svc = serviceClient()
  const { data: admin } = await svc.from('admins').select('id').eq('auth_user_id', user.id).single()
  if (admin) return { user, role: 'admin' as const, svc }
  const { data: coach } = await svc.from('coaches').select('id').eq('auth_user_id', user.id)
    .eq('is_active', true).single()
  if (coach) return { user, role: 'coach' as const, svc }
  return null
}
