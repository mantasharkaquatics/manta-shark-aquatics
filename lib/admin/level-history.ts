/* The level / stage change log (level_upgrades) as the Levels page shows it:
   each row with the swimmer's name and who made the change.

   One read for the page's first screen and for /api/admin/level-history, which
   pages further back and reads one swimmer's own history. The page used to
   show only the school's newest 30 rows and nothing else in the back office
   read this table, so "why did my child go from L3 to L2 last month" could not
   be answered without the database (found 2026-10-08). */

export const LEVEL_HISTORY_PAGE = 30

/** A database row as the API returns it (untyped client). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export async function readLevelHistory(svc: Row, opts: { studentId?: string | null; before?: string | null; limit?: number } = {}): Promise<{ rows: Row[]; more: boolean; error: Row }> {
  const limit = opts.limit ?? LEVEL_HISTORY_PAGE
  let q = svc.from('level_upgrades')
    .select('id, from_level, to_level, from_stage, to_stage, upgraded_at, notes, student_id, upgraded_by')
  if (opts.studentId) q = q.eq('student_id', opts.studentId)
  if (opts.before) q = q.lt('upgraded_at', opts.before)
  // One more than shown, to know whether "load more" has anything behind it.
  const { data: raw, error } = await q.order('upgraded_at', { ascending: false }).order('id').limit(limit + 1)
  if (error) return { rows: [], more: false, error }
  const more = (raw || []).length > limit
  const rawHistory: Row[] = (raw || []).slice(0, limit)
  if (rawHistory.length === 0) return { rows: [], more: false, error: null }

  const sIds = [...new Set(rawHistory.map(h => h.student_id).filter(Boolean))]
  // `upgraded_by` is POLYMORPHIC and has no foreign key, deliberately: an
  // admin id when someone assigns a level through this page, a COACH id when
  // the trg_level_upgrade trigger promotes a swimmer who has finished every
  // skill. Looking only in `admins` left every trigger-created row reading
  // "by" with no name after it, and those are the ordinary case.
  const byIds = [...new Set(rawHistory.map(h => h.upgraded_by).filter(Boolean))]
  const [{ data: hStudents }, { data: hAdmins }, { data: hCoaches }] = await Promise.all([
    svc.from('students').select('id, full_name').in('id', sIds),
    byIds.length ? svc.from('admins').select('id, first_name, last_name').in('id', byIds) : Promise.resolve({ data: [] }),
    byIds.length ? svc.from('coaches').select('id, first_name, last_name').in('id', byIds) : Promise.resolve({ data: [] }),
  ])
  const hsMap: Record<string, Row> = {}
  for (const s of hStudents || []) hsMap[s.id] = s
  const byMap: Record<string, Row> = {}
  for (const a of hAdmins || []) byMap[a.id] = { ...a, role: 'admin' }
  // Coaches second so that in the impossible event of an id in both tables
  // the answer is stable rather than order-of-arrival.
  for (const c of hCoaches || []) byMap[c.id] = { ...c, role: 'coach' }
  const rows = rawHistory.map(h => ({
    ...h,
    students: hsMap[h.student_id],
    by: byMap[h.upgraded_by] ?? null,
  }))
  return { rows, more, error: null }
}
