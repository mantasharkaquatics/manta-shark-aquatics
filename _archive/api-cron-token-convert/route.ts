import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { tokenExpiryFromNow, TEAM_SLUG } from '@/lib/tokens'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

// Daily cron (cron-job.org, Bearer CRON_SECRET): converts remaining lessons on
// expired credit packages into token packages 1:1 (spec v1.1, source='expiry').
// Trials and Swim Team never convert. Marks lesson_credits.converted_to_token_at
// BEFORE inserting the token package (claim-first, rollback on failure) so a
// concurrent duplicate run cannot double-convert.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: teamRow } = await svc
    .from('course_types').select('id').eq('slug', TEAM_SLUG).single()
  const teamId = teamRow?.id ?? null

  const nowIso = new Date().toISOString()
  const { data: expired, error: scanErr } = await svc
    .from('lesson_credits')
    .select('id, parent_id, course_type_id, total_credits, used_credits, is_trial')
    .is('converted_to_token_at', null)
    .lt('expires_at', nowIso)
  if (scanErr) {
    console.error('token-convert scan error:', scanErr)
    return NextResponse.json({ error: 'DB error (scan)' }, { status: 500 })
  }

  let converted = 0
  let skipped = 0
  let failed = 0
  const emailTargets = new Map<string, { count: number; courseIds: Set<string> }>()

  for (const c of expired || []) {
    const remaining = (c.total_credits ?? 0) - (c.used_credits ?? 0)
    const eligible = remaining > 0 && !c.is_trial && c.course_type_id && c.course_type_id !== teamId && c.parent_id

    // Claim first (also stamps ineligible rows so they leave the scan forever).
    const { data: claimed, error: claimErr } = await svc
      .from('lesson_credits')
      .update({ converted_to_token_at: nowIso })
      .eq('id', c.id)
      .is('converted_to_token_at', null)
      .select('id')
    if (claimErr || !claimed || claimed.length === 0) continue // raced or failed; next run retries if unstamped

    if (!eligible) { skipped++; continue }

    const { error: insErr } = await svc.from('token_packages').insert({
      parent_id: c.parent_id,
      course_type_id: c.course_type_id,
      total_tokens: remaining,
      source: 'expiry',
      source_credit_id: c.id,
      expires_at: tokenExpiryFromNow(),
      note: 'Automatic conversion of expired credits',
    })
    if (insErr) {
      // Roll back the claim so the next run retries this package.
      await svc.from('lesson_credits').update({ converted_to_token_at: null }).eq('id', c.id)
      console.error('token-convert insert error for credit', c.id, insErr)
      failed++
      continue
    }
    converted++
    const t = emailTargets.get(c.parent_id) || { count: 0, courseIds: new Set<string>() }
    t.count += remaining
    t.courseIds.add(c.course_type_id)
    emailTargets.set(c.parent_id, t)
  }

  // Notify parents (best effort; email failure never blocks conversion)
  let emailed = 0
  for (const [parentId, t] of emailTargets) {
    try {
      const { data: p } = await svc.from('parents').select('first_name, email').eq('id', parentId).single()
      if (!p?.email) continue
      const { data: cts } = await svc.from('course_types').select('name').in('id', Array.from(t.courseIds))
      const courseNames = (cts || []).map((x: any) => x.name).join(', ')
      await sendEmail({
        type: 'credits_converted_to_tokens',
        to: p.email,
        parentName: p.first_name,
        tokenCount: t.count,
        courseNames,
        validityDays: 60,
      })
      emailed++
    } catch (e) {
      console.error('token-convert email error for parent', parentId, e)
    }
  }

  return NextResponse.json({ ok: true, scanned: (expired || []).length, converted, skipped, failed, emailed })
}
