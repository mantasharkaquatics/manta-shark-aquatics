/* eslint-disable @typescript-eslint/no-explicit-any */
/* A family's second guardian (owner, 2026-10-22: "和主帳號一樣").

   They sign in with their own email and password and then act as the family:
   my_parent_id() (docs/migration-guardians.sql) gives the browser the family,
   familyOf() in lib/api-auth.ts gives it to server routes, and the family's
   emails are copied to them (guardianCopies in lib/email-family.ts). Text
   messages still go to the main account's phone only.

   Only the main account invites or removes them. One guardian per family.
   Removing one deletes their login (it was made for this family only), so
   access ends at once and the address is free to be used again. */

export type GuardianView = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  invited_at: string
  signed_in: boolean
}

export const MAX_GUARDIANS = 1

/** The family's live guardians, with whether each has signed in yet. */
export async function familyGuardians(svc: any, parentId: string): Promise<GuardianView[] | null> {
  const { data, error } = await svc.from('parent_guardians')
    .select('id, first_name, last_name, email, invited_at, auth_user_id')
    .eq('parent_id', parentId).is('removed_at', null).order('invited_at')
  if (error) return null
  return Promise.all((data || []).map(async (g: any) => {
    let signedIn = false
    if (g.auth_user_id) {
      const { data: u } = await svc.auth.admin.getUserById(g.auth_user_id)
      signedIn = !!u?.user?.last_sign_in_at
    }
    return { id: g.id, first_name: g.first_name, last_name: g.last_name, email: g.email, invited_at: g.invited_at, signed_in: signedIn }
  }))
}

/** A set-password link for the guardian's login, sent as the invitation in
 *  the family's language. */
export async function sendGuardianInvite(svc: any, appOrigin: string, g: { email: string; first_name: string | null }, family: { first_name: string | null; last_name: string | null; preferred_language: string | null }): Promise<boolean> {
  const { data: link, error } = await svc.auth.admin.generateLink({ type: 'recovery', email: g.email })
  const token = link?.properties?.hashed_token
  if (error || !token) { console.error('[guardian] invite link not made', error); return false }
  const { sendEmail } = await import('./email')
  return sendEmail({
    type: 'guardian_invite', to: g.email, lang: family.preferred_language || 'en',
    parentName: g.first_name || '',
    inviterName: `${family.first_name || ''} ${family.last_name || ''}`.trim(),
    resetUrl: `${appOrigin}/reset-password?token_hash=${encodeURIComponent(token)}`,
  }).catch(() => false)
}

/** Ends a guardian's access: the row is kept for the record, the login goes.
 *  If the login cannot be deleted it is banned instead, which also ends it. */
export async function removeGuardian(svc: any, row: { id: string; auth_user_id: string | null }): Promise<boolean> {
  const { error } = await svc.from('parent_guardians')
    .update({ removed_at: new Date().toISOString(), auth_user_id: null }).eq('id', row.id).is('removed_at', null)
  if (error) return false
  if (row.auth_user_id) {
    const del = await svc.auth.admin.deleteUser(row.auth_user_id)
    if (del.error) {
      console.error('[guardian] login not deleted, banning', del.error)
      await svc.auth.admin.updateUserById(row.auth_user_id, { ban_duration: '876000h' })
    }
  }
  return true
}
