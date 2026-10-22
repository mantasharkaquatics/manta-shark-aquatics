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
