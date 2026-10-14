import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCron } from '@/lib/cron-auth'
import { sweepLowBalance } from '@/lib/low-balance'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const maxDuration = 60

// Every day at 9:00 America/Los_Angeles (cron-job.org, Authorization: Bearer
// CRON_SECRET): email the families whose points will not last two more weeks
// of their lessons (lib/low-balance.ts). Once per dip below the line; safe to
// run again the same day.
//
// ?dry=1 sends nothing and lists who would be emailed (first names only), for
// checking before the first real run.
export async function GET(req: NextRequest) {
  const denied = requireCron(req)
  if (denied) return denied
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const dry = req.nextUrl.searchParams.get('dry') === '1'
  try {
    const result = await sweepLowBalance(svc, async (parentId, r) => {
      const { data: p } = await svc.from('parents')
        .select('first_name, email, preferred_language').eq('id', parentId).maybeSingle()
      if (!p?.email) return false
      return sendEmail({
        type: 'low_balance', to: p.email, parentName: p.first_name || '',
        lang: p.preferred_language || 'en',
        balance: r.balance, weekly: r.weekly, booked: r.booked, weeksLeft: r.weeksLeft,
      })
    }, { dry })

    if (dry && result.dry?.length) {
      const ids = result.dry.map(d => d.parentId)
      const { data: ps } = await svc.from('parents').select('id, first_name').in('id', ids)
      const name = new Map((ps || []).map((p: any) => [p.id, p.first_name || '?']))
      return NextResponse.json({ ...result, dry: result.dry.map(d => ({ family: name.get(d.parentId) || '?', weeksLeft: d.weeksLeft })) })
    }
    console.log('low-balance:', JSON.stringify(result))
    return NextResponse.json(result, { status: result.failed ? 207 : 200 })
  } catch (e: any) {
    console.error('low-balance failed:', e?.message || e)
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
