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
   auth_user_id) or as a live guardian (parent_guardians). Returns the parents
   row with the columns asked for, shaped like a supabase read so call sites
   can swap `.from('parents')...eq('auth_user_id', id).single()` for it.
   `guardianId` is set when the person is a guardian, not the main account.

   `role` (owner, 2026-10-23): 'main', 'full' (a second guardian with the main
   account's rights) or 'viewer' (a family member who may only look: the
   schedule and the swimmers' learning, no points or payments, no booking,
   cancelling or account changes). A viewer gets NO family from here unless
   the caller passes { viewer: true } -- every route is closed to them by
   default and opened one by one where looking is all it does. Before
   docs/migration-guardian-roles.sql runs there is no role column and every
   guardian is 'full', as before. */
export type FamilyRole = 'main' | 'full' | 'viewer'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function familyOf(svc: any, authUserId: string, cols = 'id', opts: { viewer?: boolean } = {}): Promise<{ data: any | null; guardianId: string | null; role: FamilyRole | null }> {
  const none = { data: null, guardianId: null, role: null }
  const { data: own } = await svc.from('parents').select(cols).eq('auth_user_id', authUserId).maybeSingle()
  if (own) return { data: own, guardianId: null, role: 'main' }
  let { data: g, error } = await svc.from('parent_guardians').select('id, parent_id, role')
    .eq('auth_user_id', authUserId).is('removed_at', null).maybeSingle()
  if (error) {
    // No role column yet: every guardian has full rights.
    ;({ data: g, error } = await svc.from('parent_guardians').select('id, parent_id')
      .eq('auth_user_id', authUserId).is('removed_at', null).maybeSingle())
  }
  if (error || !g) return none
  const role: FamilyRole = g.role === 'viewer' ? 'viewer' : 'full'
  if (role === 'viewer' && !opts.viewer) return none
  const { data: fam } = await svc.from('parents').select(cols).eq('id', g.parent_id).maybeSingle()
  return fam ? { data: fam, guardianId: g.id, role } : none
}

/** The signed-in family. A view-only member is turned away (null) unless the
 *  route passes { viewer: true }; see familyOf. */
export async function requireParent(opts: { viewer?: boolean } = {}) {
  const user = await getAuthUser()
  if (!user) return null
  const svc = serviceClient()
  const { data: parent, guardianId, role } = await familyOf(svc, user.id, 'id, email, first_name', opts)
  if (!parent || !role) return null
  return { user, parent: parent as { id: string; email: string | null; first_name: string | null }, svc, guardianId, role }
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
