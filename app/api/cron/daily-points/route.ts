import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { expireGrantedPoints } from '@/lib/points-wallet'
import { awardDueReferrals } from '@/lib/referrals'
import { settleAssessmentCredits } from '@/lib/assessments'
import { sweepVouchers } from '@/lib/vouchers'
import { sendEmail } from '@/lib/email'
import { sendRenewalNotices, HOLD_RELEASE_DAYS } from '@/lib/fixed-classes'
import { addDaysStr } from '@/lib/vouchers'
import { formatTime12h } from '@/lib/date'

export const runtime = 'nodejs'

// Once a day (cron-job.org, Authorization: Bearer CRON_SECRET).
//
// Granted points last one year (lib/points GRANTED_POINTS_VALID_MONTHS). This
// takes away whatever is left of a grant whose year is up, one ledger line per
// family ("grant_expired"), so the family's statement says where the points
// went. Purchased points are never touched.
//
// It also pays referral rewards (lib/referrals): 40 granted points to both
// families once the new family has taken its first paid lesson.
//
// And it settles assessment credits (lib/assessments): 85 granted points once a
// swimmer has taken 8 lessons within 60 days of the assessment, or the credit
// closes quietly when the 60 days are over.
//
// And it looks after make-up vouchers (lib/vouchers): past their date they
// expire, and a family gets one email a week before one runs out.
//
// And it asks about renewing (lib/fixed-classes): one email per fixed class,
// three weeks before its last lesson, while its slot is still held for them.
//
// Safe to run more than once a day, or to miss a day: each run expires only
// what is due at that moment and what has not already been expired, and a
// referral is claimed before it is paid, so it is never paid twice.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: wallets, error } = await svc
    .from('point_wallets')
    .select('parent_id')
    .gt('balance_granted', 0)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let expiredFamilies = 0
  let expiredPoints = 0
  const failed: string[] = []
  for (const w of wallets || []) {
    try {
      const n = await expireGrantedPoints(svc, w.parent_id)
      if (n > 0) { expiredFamilies++; expiredPoints += n }
    } catch (e) {
      // One family's wallet must not stop everyone else's; tomorrow retries it.
      console.error(`daily-points: could not expire granted points for ${w.parent_id}:`, e)
      failed.push(w.parent_id)
    }
  }

  // Referrals after expiry, so a reward granted today is never looked at by
  // today's expiry pass.
  let referrals = { awarded: 0, failed: 0 }
  try {
    referrals = await awardDueReferrals(svc)
  } catch (e) {
    console.error('daily-points: referral awards failed:', e)
    referrals.failed = -1
  }

  // Also after expiry, for the same reason.
  let credits = { awarded: 0, expired: 0, failed: 0 }
  try {
    credits = await settleAssessmentCredits(svc)
  } catch (e) {
    console.error('daily-points: assessment credits failed:', e)
    credits.failed = -1
  }

  let vouchers = { expired: 0, reminded: 0, failed: 0 }
  try {
    const r = await sweepVouchers(svc, async v => {
      const [{ data: p }, { data: kids }] = await Promise.all([
        svc.from('parents').select('first_name, email, preferred_language').eq('id', v.parent_id).single(),
        svc.from('students').select('full_name').in('id', [v.student_id, v.student2_id].filter(Boolean) as string[]),
      ])
      if (!p?.email) return false
      return sendEmail({
        type: 'voucher_expiring', to: p.email, parentName: p.first_name || '',
        lang: p.preferred_language || 'en', expiresOn: v.expires_on,
        studentNames: (kids || []).map((k: any) => k.full_name),
        course: v.course_slug, minutes: v.minutes,
      })
    })
    vouchers = { ...r, failed: 0 }
  } catch (e) {
    console.error('daily-points: voucher sweep failed:', e)
    vouchers.failed = -1
  }

  let renewals = { sent: 0, failed: 0 }
  try {
    renewals = await sendRenewalNotices(svc, async (fc, last) => {
      const [{ data: p }, { data: kids }, { data: coach }] = await Promise.all([
        svc.from('parents').select('first_name, email, preferred_language').eq('id', fc.parent_id).single(),
        svc.from('students').select('full_name').in('id', [fc.student_id, fc.student2_id].filter(Boolean) as string[]),
        svc.from('coaches').select('first_name').eq('id', fc.coach_id).maybeSingle(),
      ])
      if (!p?.email) return false
      return sendEmail({
        type: 'fixed_class_renewal', to: p.email, parentName: p.first_name || '',
        lang: p.preferred_language || 'en', studentNames: (kids || []).map((k: any) => k.full_name),
        weekday: fc.weekday, time: formatTime12h(String(fc.start_time).slice(0, 5)), coachName: coach?.first_name || '',
        date: last, expiresOn: addDaysStr(last, -HOLD_RELEASE_DAYS),
        linkUrl: `https://www.mantasharkaquatics.net/dashboard/fixed-class/${fc.id}?renew=1`,
      })
    })
  } catch (e) {
    console.error('daily-points: renewal notices failed:', e)
    renewals.failed = -1
  }

  return NextResponse.json({
    renewalsSent: renewals.sent, renewalsFailed: renewals.failed,
    vouchersExpired: vouchers.expired, vouchersReminded: vouchers.reminded, vouchersFailed: vouchers.failed,
    checked: (wallets || []).length, expiredFamilies, expiredPoints, failed: failed.length,
    referralsAwarded: referrals.awarded, referralsFailed: referrals.failed,
    assessmentCreditsAwarded: credits.awarded, assessmentCreditsExpired: credits.expired,
    assessmentCreditsFailed: credits.failed,
  })
}
