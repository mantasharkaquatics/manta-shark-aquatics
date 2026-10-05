/* Reading past the API's 1,000-row cap.

   Supabase hands back at most 1,000 rows per request and says nothing when it
   stops there, so a read of "every booking" quietly lost the rest (found
   2026-10-05). These helpers fetch a page at a time. The query `make` builds
   must be ordered by something unique, or pages overlap and rows repeat.

   One copy, here. Four files used to carry their own (2026-10-05). */

export const PAGE_ROWS = 1000
/** Ids per .in(): thousands of uuids in one URL is past what the API takes. */
export const IN_CHUNK = 500

/** Every row. An error ends the read and comes back with what was read. */
export async function allRows(make: () => any): Promise<{ data: any[]; error: any }> {
  const out: any[] = []
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await make().range(from, from + PAGE_ROWS - 1)
    if (error) return { data: out, error }
    out.push(...(data || []))
    if (!data || data.length < PAGE_ROWS) return { data: out, error: null }
  }
}

/** allRows over a long id list, IN_CHUNK ids per request. */
export async function allRowsIn(ids: string[], make: (chunk: string[]) => any): Promise<{ data: any[]; error: any }> {
  const out: any[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await allRows(() => make(ids.slice(i, i + IN_CHUNK)))
    out.push(...data)
    if (error) return { data: out, error }
  }
  return { data: out, error: null }
}

/** Every row, for a page that shows what it can: an error is logged under
 *  `label` and the read ends with the rows it has. */
export async function allRowsOrLog(label: string, make: () => any): Promise<any[]> {
  const { data, error } = await allRows(make)
  if (error) console.error(label + ': read failed:', error.message || error)
  return data
}
