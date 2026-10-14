import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCron } from '@/lib/cron-auth'
import { getTodayLA } from '@/lib/date'
import { sendBirthdayCards } from '@/lib/birthday'

export const runtime = 'nodejs'

// Every day at 8:00 America/Los_Angeles (cron-job.org, Authorization: Bearer
// CRON_SECRET): today's birthday cards (lib/birthday.ts). Safe to run again the
// same day -- a card and its gift go out once per swimmer per year, and a run
// that failed to email picks the email up again.
export async function GET(req: NextRequest) {
  const denied = requireCron(req)
  if (denied) return denied
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  try {
    const result = await sendBirthdayCards(svc, getTodayLA())
    console.log('birthday cards:', JSON.stringify(result))
    return NextResponse.json(result, { status: result.failed.length ? 207 : 200 })
  } catch (e: any) {
    console.error('birthday cards failed:', e?.message || e)
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
