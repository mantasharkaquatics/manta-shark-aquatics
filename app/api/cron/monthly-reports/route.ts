import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTodayLA } from '@/lib/date'
import { generateMonth, sendReadyMonths, emailPendingReports, monthOf, monthEnd, previousMonth, hourLA } from '@/lib/monthly-reports'
import { requireCron } from '@/lib/cron-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

// Every hour (cron-job.org, Authorization: Bearer CRON_SECRET). See lib/monthly-reports.
//
//  - Last day of the month, from 11 PM Los Angeles time: write that month's
//    reports. A run writes as many as fit in its time; the next hour carries on.
//  - Days 1-7: write any report of last month that is still missing (a family
//    with many swimmers, a model outage), so nothing waits on a person noticing.
//  - Every run: email every family whose released reports have not been
//    emailed yet (first, so a run busy writing cannot starve the emails; a
//    failed send is tried again the next hour -- lib/monthly-reports
//    emailPendingReports); after writing, release any month whose reports are
//    all approved and which is over, and email it with the time left.
//  - Any other hour: carry on rewriting the oldest finished month still held.
// Every other hour of the month it finds nothing to do and returns at once.
export async function GET(req: NextRequest) {
  const denied = requireCron(req)
  if (denied) return denied
  const started = Date.now()
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const today = getTodayLA()
  const out: Record<string, unknown> = { today }

  // Emails still owed from earlier runs go first, so a run busy writing
  // cannot starve them.
  const email = async (budgetMs: number, key: string) => {
    if (budgetMs < 2_000) return
    try {
      out[key] = await emailPendingReports(svc, { budgetMs })
    } catch (e) {
      console.error('cron monthly-reports: emailing failed', e)
      out.emailError = String(e)
    }
  }
  await email(15_000, 'emails')
  // Writing gets what is left of the minute (it stops between reports).
  const writeBudget = Math.max(15_000, 45_000 - (Date.now() - started))

  try {
    if (monthEnd(monthOf(today)) === today && hourLA() >= 23) {
      out.generated = { month: monthOf(today), ...(await generateMonth(svc, monthOf(today), { budgetMs: writeBudget })) }
    } else if (Number(today.slice(8, 10)) <= 7) {
      const month = previousMonth(monthOf(today))
      out.generated = { month, ...(await generateMonth(svc, month, { budgetMs: writeBudget })) }
    }
  } catch (e) {
    console.error('cron monthly-reports: writing failed', e)
    out.generateError = String(e)
  }

  // Release after writing, as before: a report written just now as a draft
  // still holds its month.
  try {
    out.sent = await sendReadyMonths(svc, today)
  } catch (e) {
    console.error('cron monthly-reports: releasing failed', e)
    out.sendError = String(e)
  }
  // Whatever was just released is emailed with the time left, else next hour.
  await email(52_000 - (Date.now() - started), 'emailsAfterRelease')

  // A month that is over but still held -- a report written early that has
  // not been rewritten from the whole month -- used to wait forever once days
  // 1-7 had passed, until someone pressed Generate (found 2026-10-07). An hour
  // with nothing else to write carries on with the oldest such month; the
  // send step picks it up on the next run.
  if (!out.generated && Array.isArray(out.sent)) {
    const stuck = (out.sent as { month: string; heldEarly: number }[])
      .filter(r => r.heldEarly > 0).map(r => r.month).sort()[0]
    if (stuck && Date.now() - started < 35_000) {
      try {
        out.caughtUp = { month: stuck, ...(await generateMonth(svc, stuck, { budgetMs: 50_000 - (Date.now() - started) })) }
      } catch (e) {
        console.error('cron monthly-reports: catch-up failed', e)
        out.catchUpError = String(e)
      }
    }
  }
  return NextResponse.json(out)
}
