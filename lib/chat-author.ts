/* Who in the family wrote a message (14-role test 2, J07): a family
   member's guardian id, null for the main account. Until
   docs/migration-chat-author.sql runs the column is not there, and the row
   is written without it, as before. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertParentMessage(svc: any, row: Record<string, unknown>, guardianId: string | null | undefined) {
  if (guardianId) {
    const r = await svc.from('chat_messages').insert({ ...row, sender_guardian_id: guardianId }).select('*').single()
    if (!r.error) return r
  }
  return svc.from('chat_messages').insert(row).select('*').single()
}
