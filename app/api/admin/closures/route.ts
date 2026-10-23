import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { getTodayLA } from '@/lib/date'
import { getLocations } from '@/lib/locations'
import { createClosure, parseClosureInput, previewClosure, reopenClosure } from '@/lib/closures'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/* Admin > Closures (owner, 2026-10-23; lib/closures.ts).

   GET                                   -> { closures, pools, today }
   POST { action: 'preview', ...form }   -> what it would cancel and who would be told
   POST { action: 'create', ...form }    -> close the pool: block, cancel, email, text
   POST { action: 'banner_off', id }     -> take the banner down early
   POST { action: 'banner_on', id }      -> put it back
   POST { action: 'reopen', id }         -> booking opens again (lessons stay cancelled)

   form: { location_id, start_date, end_date, all_day, start_time, end_time,
           reason_key, reason_text } */

export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc } = auth
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
  const [{ data, error }, pools] = await Promise.all([
    svc.from('pool_closures').select('*').gte('end_date', since).order('start_date', { ascending: false }).limit(50),
    getLocations(svc).catch(() => []),
  ])
  if (error) return NextResponse.json({ error: 'unavailable', code: 'unavailable' }, { status: 503 })
  const adminIds = [...new Set((data || []).map((c: { created_by: string | null }) => c.created_by).filter(Boolean))] as string[]
  const { data: admins } = adminIds.length ? await svc.from('admins').select('id, first_name').in('id', adminIds) : { data: [] as { id: string; first_name: string }[] }
  const by = new Map((admins || []).map(a => [a.id, a.first_name]))
  return NextResponse.json({
    closures: (data || []).map((c: Record<string, unknown>) => ({ ...c, created_by_name: by.get(c.created_by as string) || null })),
    pools: pools.map(p => ({ id: p.id, name: p.name, is_active: p.is_active })),
    today: getTodayLA(),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc, admin } = auth
  const b = await readJson(req)
  if (!b) return badRequest()

  if (b.action === 'banner_off' || b.action === 'banner_on' || b.action === 'reopen') {
    if (typeof b.id !== 'string') return badRequest()
    if (b.action === 'reopen') {
      return (await reopenClosure(svc, b.id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'failed', code: 'save' }, { status: 500 })
    }
    const { error } = await svc.from('pool_closures').update({ banner_off_at: b.action === 'banner_off' ? new Date().toISOString() : null }).eq('id', b.id)
    return error ? NextResponse.json({ error: 'failed', code: 'save' }, { status: 500 }) : NextResponse.json({ ok: true })
  }

  if (b.action !== 'preview' && b.action !== 'create') return badRequest()
  const parsed = parseClosureInput(b, getTodayLA())
  if (!parsed.ok) return NextResponse.json({ error: 'Invalid', code: parsed.code }, { status: 400 })
  const pools = await getLocations(svc).catch(() => [])
  if (!pools.some(p => p.id === parsed.input.location_id)) return NextResponse.json({ error: 'Invalid', code: 'pool' }, { status: 400 })

  try {
    if (b.action === 'preview') return NextResponse.json(await previewClosure(svc, parsed.input))
    const r = await createClosure(svc, parsed.input, admin.id)
    if (!r.ok) return NextResponse.json({ error: 'failed', code: r.code }, { status: r.code === 'stripe' ? 502 : 500 })
    return NextResponse.json(r)
  } catch (e) {
    console.error('[admin/closures]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'failed', code: 'unavailable' }, { status: 503 })
  }
}
