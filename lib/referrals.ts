// Referrals: a family shares a code, a new family registers with it, and once
// the new family has taken its first lesson PAID WITH PURCHASED POINTS, both
// families receive REFERRAL_POINTS granted points (owner's rules, 2026-09-24):
//
//   - the reward is granted points: not refundable, spent first, and they
//     expire one year after they are added (lib/points GRANTED_POINTS_VALID_MONTHS);
//   - a referrer has no cap; a referred family can be referred only once
//     (referrals.referred_parent_id is unique);
//   - the code can only be given at registration -- never added afterwards;
//   - the Swim Assessment (card-paid) does not count, and neither does a lesson
//     paid entirely with granted points: the new family has to have paid.
//
// Everything here runs with the service client. The browser never writes a
// referral row: the register page hands the code to /api/referrals/claim.

import { applyPoints } from '@/lib/points-wallet'
import { REFERRAL_POINTS } from '@/lib/points'
import { getTodayLA } from '@/lib/date'
import { sendEmail } from '@/lib/email'

type Svc = any

// No 0/O, 1/I/L: a code gets read aloud at the pool and typed on a phone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export const normalizeCode = (raw: unknown) =>
  String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

/** "Wang" -> the family name shown to the other side. Last name only, by the
 *  owner's choice: recognisable, without a child's name or any contact detail. */
export const familyName = (p: { last_name?: string | null } | null | undefined) =>
  String(p?.last_name ?? '').trim() || '—'

/** The family's code, made on first request. */
export async function getOrCreateCode(svc: Svc, parentId: string): Promise<string> {
  const { data: p } = await svc.from('parents').select('referral_code').eq('id', parentId).single()
  if (p?.referral_code) return p.referral_code
  // A collision is astronomically rare at 31^6, but the unique index is what
  // actually decides; on a clash, try another.
  for (let i = 0; i < 5; i++) {
    const code = randomCode()
    const { data, error } = await svc.from('parents')
      .update({ referral_code: code })
      .eq('id', parentId).is('referral_code', null)
      .select('referral_code').maybeSingle()
    if (data?.referral_code) return data.referral_code
    if (!error) {
      // Someone else set it between the read and the write -- use theirs.
      const { data: again } = await svc.from('parents').select('referral_code').eq('id', parentId).single()
      if (again?.referral_code) return again.referral_code
    }
  }
  throw new Error('Could not create a referral code')
}

/** Who a code belongs to, for the register page's "referred by" line. */
export async function lookupCode(svc: Svc, rawCode: unknown) {
  const code = normalizeCode(rawCode)
  if (code.length !== CODE_LENGTH) return null
  const { data } = await svc.from('parents').select('id, first_name, last_name').eq('referral_code', code).maybeSingle()
  if (!data) return null
  // "Shane C." -- enough for a friend to recognise, nothing more.
  const initial = String(data.last_name || '').trim().charAt(0)
  return { parentId: data.id as string, code, display: `${data.first_name || ''}${initial ? ' ' + initial + '.' : ''}`.trim() }
}

export type ClaimResult =
  | { ok: true }
  | { ok: false; error: 'INVALID_CODE' | 'OWN_CODE' | 'ALREADY_REFERRED' | 'NOT_NEW' }

/**
 * Binds a just-registered family to the family whose code they used. Only a
 * brand-new account qualifies: registered within the last day, no bookings,
 * and not already referred -- so "enter a code later" is impossible even by
 * calling this route by hand.
 */
export async function claimReferral(svc: Svc, newParentId: string, rawCode: unknown): Promise<ClaimResult> {
  const owner = await lookupCode(svc, rawCode)
  if (!owner) return { ok: false, error: 'INVALID_CODE' }
  if (owner.parentId === newParentId) return { ok: false, error: 'OWN_CODE' }

  const { data: me } = await svc.from('parents').select('id, registered_at').eq('id', newParentId).single()
  const registered = me?.registered_at ? Date.parse(me.registered_at) : 0
  if (!me || Date.now() - registered > 24 * 60 * 60 * 1000) return { ok: false, error: 'NOT_NEW' }
  const { count } = await svc.from('bookings').select('id', { count: 'exact', head: true }).eq('parent_id', newParentId)
  if ((count ?? 0) > 0) return { ok: false, error: 'NOT_NEW' }

  const { error } = await svc.from('referrals').insert({
    referrer_parent_id: owner.parentId,
    referred_parent_id: newParentId,
    code: owner.code,
  })
  if (error) {
    if ((error as any).code === '23505') return { ok: false, error: 'ALREADY_REFERRED' }
    throw new Error(`Could not record the referral: ${error.message}`)
  }
  return { ok: true }
}

/** The referral block on the points card: the code and who has used it. */
export async function referralSummary(svc: Svc, parentId: string) {
  const code = await getOrCreateCode(svc, parentId)
  const { data: rows } = await svc.from('referrals')
    .select('referred_parent_id, status, awarded_at, created_at')
    .eq('referrer_parent_id', parentId)
    .neq('status', 'void')
    .order('created_at', { ascending: false })
  const ids = (rows || []).map((r: any) => r.referred_parent_id)
  const { data: families } = ids.length
    ? await svc.from('parents').select('id, last_name').in('id', ids)
    : { data: [] as any[] }
  const nameOf = new Map((families || []).map((f: any) => [f.id, familyName(f)]))
  return {
    code,
    points: REFERRAL_POINTS,
    referrals: (rows || []).map((r: any) => ({
      family: nameOf.get(r.referred_parent_id) ?? '—',
      status: r.status as 'pending' | 'awarded',
    })),
  }
}

/**
 * The first lesson that earns the reward: paid at least partly with purchased
 * points, not cancelled, not refunded in full, and its date already past.
 */
async function qualifyingBooking(svc: Svc, parentId: string, today: string): Promise<string | null> {
  const { data: bookings } = await svc.from('bookings')
    .select('id, class_session_id, points_charged, points_granted, points_refunded, status, is_trial')
    .eq('parent_id', parentId)
    .not('points_charged', 'is', null)
    .not('status', 'in', '("cancelled","in_cart","pending_partner","pending_payment")')
  const paid = (bookings || []).filter((b: any) =>
    !b.is_trial
    && (b.points_charged ?? 0) > (b.points_granted ?? 0)
    && (b.points_refunded ?? 0) < (b.points_charged ?? 0))
  if (paid.length === 0) return null
  const { data: sessions } = await svc.from('class_sessions')
    .select('id, session_date')
    .in('id', [...new Set(paid.map((b: any) => b.class_session_id))])
    .lt('session_date', today)
  const past = new Set((sessions || []).map((s: any) => s.id))
  return paid.find((b: any) => past.has(b.class_session_id))?.id ?? null
}

/**
 * Pays every referral whose new family has now taken a paid lesson. Run daily.
 *
 * The row is claimed (pending -> awarded) BEFORE any points move, so two runs
 * overlapping cannot pay the same referral twice. If the first grant then
 * fails, the claim is put back and tomorrow tries again; if only the second
 * fails, that is logged loudly for a person to finish by hand rather than
 * paying the first family twice on a retry.
 */
export async function awardDueReferrals(svc: Svc): Promise<{ awarded: number; failed: number }> {
  const today = getTodayLA()
  const { data: pending } = await svc.from('referrals')
    .select('id, referrer_parent_id, referred_parent_id')
    .eq('status', 'pending')
  let awarded = 0, failed = 0

  for (const r of pending || []) {
    const bookingId = await qualifyingBooking(svc, r.referred_parent_id, today)
    if (!bookingId) continue

    const { data: claimed } = await svc.from('referrals')
      .update({ status: 'awarded', awarded_at: new Date().toISOString(), qualifying_booking_id: bookingId })
      .eq('id', r.id).eq('status', 'pending')
      .select('id')
    if (!claimed || claimed.length === 0) continue

    const { data: fams } = await svc.from('parents')
      .select('id, first_name, last_name, email')
      .in('id', [r.referrer_parent_id, r.referred_parent_id])
    const referrer = (fams || []).find((f: any) => f.id === r.referrer_parent_id)
    const referred = (fams || []).find((f: any) => f.id === r.referred_parent_id)

    let first
    try {
      first = await applyPoints(svc, {
        parentId: r.referrer_parent_id, reason: 'referral_bonus', points: REFERRAL_POINTS,
        toGranted: true, actor: 'system', note: familyName(referred),
      })
    } catch (e) {
      console.error(`referral ${r.id}: could not credit the referrer; will retry tomorrow:`, e)
      await svc.from('referrals').update({ status: 'pending', awarded_at: null, qualifying_booking_id: null }).eq('id', r.id)
      failed++
      continue
    }
    let second
    try {
      second = await applyPoints(svc, {
        parentId: r.referred_parent_id, reason: 'referral_bonus', points: REFERRAL_POINTS,
        toGranted: true, actor: 'system', note: familyName(referrer),
      })
    } catch (e) {
      console.error(`⚠️ referral ${r.id}: the referrer was credited but the NEW family was not. Grant ${REFERRAL_POINTS} points to parent ${r.referred_parent_id} by hand:`, e)
      failed++
      continue
    }
    awarded++

    // Best effort: the points are in either way.
    const until = (iso: string | null) => iso
      ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })
      : ''
    try {
      if (referrer?.email) await sendEmail({
        type: 'referral_reward', to: referrer.email, parentName: referrer.first_name,
        amount: REFERRAL_POINTS, referralRole: 'referrer', otherFamily: familyName(referred),
        expiresOn: until(first.grantedExpiresAt),
      })
      if (referred?.email) await sendEmail({
        type: 'referral_reward', to: referred.email, parentName: referred.first_name,
        amount: REFERRAL_POINTS, referralRole: 'referred', otherFamily: familyName(referrer),
        expiresOn: until(second.grantedExpiresAt),
      })
    } catch (e) {
      console.error(`referral ${r.id}: points credited, email failed:`, e)
    }
  }
  return { awarded, failed }
}
