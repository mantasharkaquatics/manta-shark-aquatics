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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function myFamilyRole(supabase: any): Promise<'main' | 'full' | 'viewer' | null> {
  const { data, error } = await supabase.rpc('my_family_role')
  if (error) return null
  return data === 'main' || data === 'full' || data === 'viewer' ? data : null
}
