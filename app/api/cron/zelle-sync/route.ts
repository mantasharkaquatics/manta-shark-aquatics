import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCron } from '@/lib/cron-auth'
import { syncZelle } from '@/lib/zelle-server'

export const runtime = 'nodejs'

// Every 5 minutes (cron-job.org, Authorization: Bearer CRON_SECRET): record
// BofA's Zelle emails from the company mailbox (lib/zelle-server.ts). Safe to
// run as often as wanted -- each email is recorded once. Before Gmail is
// connected it does nothing and says so.
export async function GET(req: NextRequest) {
  const denied = requireCron(req)
  if (denied) return denied
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const result = await syncZelle(svc)
  if (result.added) console.log('zelle sync:', JSON.stringify(result))
  return NextResponse.json(result, { status: result.error ? 502 : 200 })
}
