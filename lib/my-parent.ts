/* The family id of the signed-in person, from the browser: the main account
   or a live second guardian (owner 2026-10-22). my_parent_id() is the same
   function every "own family" RLS policy uses, so what this returns is what
   the browser may read. Before docs/migration-guardians.sql runs the RPC does
   not exist, and the old lookup by parents.auth_user_id answers instead. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function myParentId(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('my_parent_id')
  if (!error) return (data as string | null) || null
  const { data: p } = await supabase.from('parents').select('id').eq('auth_user_id', userId).maybeSingle()
  return p?.id || null
}

/* How the signed-in person belongs to the family (owner, 2026-10-23):
   'main', 'full' (second guardian, same rights) or 'viewer' (may only look).
   Pages use it to leave out what a viewer cannot do; the server enforces it
   either way (familyOf in lib/api-auth.ts). Before
   docs/migration-guardian-roles.sql runs the RPC does not exist and nobody is
   a viewer. */
export type FamilyRole = 'main' | 'full' | 'viewer' | null

/* The role, remembered for the tab (14-role test 2, J08: every page asked
   again and, until it knew, drew the main account's buttons -- top up,
   renew, pay -- for a view-only member). undefined: not known yet; null:
   signed out or no family. Cleared on sign-out (lib/local-account-data). */
const ROLE_KEY = 'msa_family_role'
let roleMem: { uid: string; role: FamilyRole } | null = null
const roleSubs = new Set<() => void>()
function roleStored() {
  if (roleMem || typeof window === 'undefined') return roleMem
  try { const v = JSON.parse(window.sessionStorage.getItem(ROLE_KEY) || 'null'); if (v && typeof v.uid === 'string') roleMem = v } catch {}
  return roleMem
}
export function knownFamilyRole(): FamilyRole | undefined { const m = roleStored(); return m ? m.role : undefined }
export function subscribeFamilyRole(cb: () => void) { roleSubs.add(cb); return () => { roleSubs.delete(cb) } }
function keepRole(uid: string, role: FamilyRole) {
  const was = roleStored()
  roleMem = { uid, role }
  try { if (uid) window.sessionStorage.setItem(ROLE_KEY, JSON.stringify(roleMem)); else window.sessionStorage.removeItem(ROLE_KEY) } catch {}
  if (!was || was.uid !== uid || was.role !== role) roleSubs.forEach(f => f())
}
export function forgetFamilyRole() {
  roleMem = null
  try { window.sessionStorage.removeItem(ROLE_KEY) } catch {}
  roleSubs.forEach(f => f())
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function myFamilyRole(supabase: any): Promise<FamilyRole> {
  // Whose role: a cache from another account is never used (it is dropped here).
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
  const uid: string = session?.user?.id || ''
  const known = roleStored()
  if (known && known.uid !== uid) forgetFamilyRole()
  if (!uid) { keepRole('', null); return null }
  const { data, error } = await supabase.rpc('my_family_role')
  if (error) return null
  const role: FamilyRole = data === 'main' || data === 'full' || data === 'viewer' ? data : null
  keepRole(uid, role)
  return role
}
