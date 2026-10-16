import { applyPoints } from '@/lib/points-wallet'
import { BASE_POINTS } from '@/lib/points'
import { allRows } from '@/lib/db-paging'
import { getT, toLocale, dateTag, type Locale } from '@/lib/i18n/all'
import { sendRawEmail } from '@/lib/email'
import { CONTACT_EMAIL, SCHOOL_MAILING_ADDRESS, SITE_URL } from '@/lib/site-config'
import { unsubscribeToken, unsubscribePageUrl, unsubscribeHeaders } from '@/lib/unsubscribe'

/* BIRTHDAY CARDS (owner, 2026-10-14).

   Every morning at 8 (Pacific, cron-job.org -> /api/cron/birthday-cards) each
   swimmer whose birthday it is gets a card by email, in the family's language,
   with a gift of points.

   - Who: every swimmer, taking lessons or not, child or adult, whose family is
     subscribed to the newsletter and has an email. The card carries a gift and
     a booking button, which makes it marketing mail; the newsletter switch is
     the family's consent, and the footer has a one-click unsubscribe link.
   - Nothing goes to families while SCHOOL_MAILING_ADDRESS is empty: US law
     wants a postal address in marketing mail. Test cards to staff still go.
   - Three versions: a child taking lessons ("active": a lesson in the last 60
     days or one booked ahead), a child who is not ("returning": the button
     books a lesson and the text says come back), and an adult, 18 or over
     ("adult": no age number, and spoken to directly when the account holder
     is the swimmer).
   - The gift: one 1-on-4 lesson's worth of granted points, good for three
     months. One card and one gift per swimmer per year: birthday_cards has
     (student_id, year) unique, and the gift is looked for in the ledger before
     it is given, so a second run the same day changes nothing.
   - Born on 29 February: the card comes on 28 February in other years. */

type Svc = any

export const BIRTHDAY_GIFT_POINTS = BASE_POINTS['1on4']
export const BIRTHDAY_GIFT_MONTHS = 3
export const ADULT_AGE = 18
const ACTIVE_WINDOW_DAYS = 60

export type CardKind = 'active' | 'returning' | 'adult'

export type BirthdaySwimmer = {
  studentId: string
  parentId: string
  fullName: string
  firstName: string
  dob: string
  /** The age reached on this year's birthday. */
  age: number
  /** This year's birthday, YYYY-MM-DD (28 Feb for a 29 Feb birthday in a common year). */
  date: string
  kind: CardKind
  /** Had a lesson lately or has one booked: decides the button and the closing line. */
  active: boolean
  /** Taking lessons now, took them before, or has never had one (the text
   *  must not say "welcome back" to someone who has not been yet). */
  history: 'active' | 'returning' | 'new'
  /** An adult swimmer who is the account holder: spoken to as "you". */
  self: boolean
  parentFirstName: string
  email: string | null
  lang: Locale
  subscribed: boolean
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** This year's birthday for a date of birth. */
export function birthdayIn(year: number, dob: string): string {
  const md = dob.slice(5, 10)
  if (md === '02-29' && !isLeap(year)) return `${year}-02-28`
  return `${year}-${md}`
}

const firstWord = (name: string) => (name || '').trim().split(/\s+/)[0] || ''

/** Is this swimmer the account holder? The swimmer has one free-text name and
 *  the parent a first and a last, so: the same first word ("Jane Doe" / Jane),
 *  or the whole name equal to first+last or last+first with the spaces taken
 *  out (found 2026-10-15: 王小明 / 名字 小明 + 姓氏 王 was written about in the
 *  third person). A nickname (Jen / Jennifer) still reads as someone else. */
function isAccountHolder(fullName: string, first: string, last: string): boolean {
  const fold = (x: string) => (x || '').replace(/\s+/g, '').toLowerCase()
  const f = fold(first), l = fold(last), n = fold(fullName)
  if (!f || !n) return false
  if (firstWord(first).toLowerCase() === firstWord(fullName).toLowerCase()) return true
  return !!l && (n === f + l || n === l + f)
}

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Every swimmer whose birthday falls between `from` and `to` (YYYY-MM-DD,
 * inclusive, same year), with what their card would be. Subscribed or not:
 * the admin list shows everyone, the sender filters.
 */
export async function birthdaysBetween(svc: Svc, from: string, to: string, today: string): Promise<BirthdaySwimmer[]> {
  const year = Number(from.slice(0, 4))
  const { data: students, error } = await allRows(() => svc.from('students')
    .select('id, full_name, date_of_birth, parent_id').not('date_of_birth', 'is', null)
    // Not a swimmer the desk deactivated (found 2026-10-15): a duplicate
    // record was paid a second gift, and a removed child still got a card.
    // The same filter the booking page and Admin > Booking use.
    .eq('is_active', true).order('id'))
  if (error) throw new Error('students: ' + (error.message || error))
  const due = (students || []).map((s: any) => ({ s, date: birthdayIn(year, String(s.date_of_birth)) }))
    .filter((x: any) => x.date >= from && x.date <= to && String(x.s.date_of_birth).slice(0, 4) < String(year))
  if (due.length === 0) return []

  const parentIds = [...new Set(due.map((x: any) => x.s.parent_id).filter(Boolean))] as string[]
  const parents = new Map<string, any>()
  for (let i = 0; i < parentIds.length; i += 300) {
    const { data } = await svc.from('parents').select('id, first_name, last_name, email, preferred_language, newsletter_subscribed').in('id', parentIds.slice(i, i + 300))
    for (const p of data || []) parents.set(p.id, p)
  }

  // Lessons in the last 60 days or ahead, for the "active" test.
  const studentIds = due.map((x: any) => x.s.id)
  const active = new Set<string>()
  const ever = new Set<string>()
  const since = addDays(today, -ACTIVE_WINDOW_DAYS)
  for (let i = 0; i < studentIds.length; i += 300) {
    const { data: rows } = await svc.from('bookings').select('student_id, class_session_id')
      .in('student_id', studentIds.slice(i, i + 300)).in('status', ['confirmed', 'completed'])
    const sessionIds = [...new Set((rows || []).map((r: any) => r.class_session_id).filter(Boolean))] as string[]
    const dateById = new Map<string, string>()
    for (let j = 0; j < sessionIds.length; j += 300) {
      const { data: ss } = await svc.from('class_sessions').select('id, session_date').in('id', sessionIds.slice(j, j + 300))
      for (const x of ss || []) dateById.set(x.id, x.session_date)
    }
    for (const r of rows || []) {
      const d = dateById.get(r.class_session_id)
      if (d && d >= since) active.add(r.student_id)
      if (d && d < today) ever.add(r.student_id)
    }
  }

  return due.map(({ s, date }: any): BirthdaySwimmer => {
    const p = parents.get(s.parent_id) || {}
    const dob = String(s.date_of_birth)
    const age = Number(date.slice(0, 4)) - Number(dob.slice(0, 4))
    const firstName = firstWord(s.full_name)
    const adult = age >= ADULT_AGE
    const isActive = active.has(s.id)
    return {
      studentId: s.id, parentId: s.parent_id, fullName: s.full_name || '', firstName, dob, age, date,
      kind: adult ? 'adult' : isActive ? 'active' : 'returning',
      active: isActive,
      history: isActive ? 'active' : ever.has(s.id) ? 'returning' : 'new',
      self: adult && isAccountHolder(s.full_name, p.first_name, p.last_name),
      parentFirstName: p.first_name || '',
      email: p.email || null,
      lang: toLocale(p.preferred_language),
      subscribed: !!p.newsletter_subscribed,
    }
  }).sort((a: BirthdaySwimmer, b: BirthdaySwimmer) => a.date.localeCompare(b.date) || a.fullName.localeCompare(b.fullName))
}

// ---------------------------------------------------------------------------
// The card. Table layout and inline styles: what Gmail, Outlook and Apple Mail
// render alike. Images are PNGs on the site (public/email). The media query
// only stacks the gift ticket on phones; clients that ignore it get the
// two-column ticket, which still reads.

const NAVY = '#12254a', ORANGE = '#f09800', INK = '#16294a', MUTED = '#5d6f8f'
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', Helvetica, Arial, sans-serif"
const SERIF = "Georgia, 'Times New Roman', 'PingFang TC', 'Songti TC', serif"

const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return n + 'th'
  return n + (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th')
}

export function renderBirthdayCard(sw: BirthdaySwimmer, opts: { points: number; expiresAt: string; parentId: string; test?: boolean }) {
  const L = sw.lang
  const t = getT(L)
  const name = esc(sw.firstName || sw.fullName)
  const site = SITE_URL
  const adult = sw.kind === 'adult'
  const expires = new Date(opts.expiresAt).toLocaleDateString(dateTag(L, 'en-US'), { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'short', day: 'numeric' })

  const subject = (opts.test ? '[TEST] ' : '') + (adult
    ? t('bday.email.subjectAdult', { name: sw.firstName })
    : t('bday.email.subject', { name: sw.firstName, age: sw.age, ord: ordinal(sw.age) }))
  const title = adult ? t('bday.email.titleAdult', { name }) : t('bday.email.title', { name, age: sw.age })
  const hero = adult
    ? `<div style="font-family:${SERIF};font-size:54px;line-height:1.1;font-weight:700;color:${ORANGE};">${t('bday.email.heroAdult')}</div>`
    : `<div class="big" style="font-family:${SERIF};font-size:150px;line-height:.9;font-weight:700;color:${ORANGE};">${sw.age}</div>`

  // The words follow the swimmer's age (owner, 2026-10-14): 0-17 playful and
  // spoken to the child; 18-30 drive and training; 31-40 staying active and
  // healthy; 41+ health and learning for life. p1 carries the age band, p2
  // how they stand with the school -- someone who has never had a lesson is
  // not "welcomed back". Adults are spoken to as "you" when they hold the
  // account, otherwise the parent reads about them by name.
  const band = !adult ? 'kid' : sw.age <= 30 ? '18' : sw.age <= 40 ? '31' : '41'
  const h = sw.history
  const who = sw.self ? 'Self' : 'Other'
  const hi = band === 'kid' ? t('bday.email.dearKid', { name })
    : sw.self ? t('assess.email.hi', { name: esc(sw.parentFirstName) || name }) : t('assess.email.hi', { name: esc(sw.parentFirstName || '') })
  const sub = t(band === 'kid' ? 'bday.email.sub' : `bday.email.sub${band}`)
  const p1 = band === 'kid' ? t('bday.email.p1Kid') : t(`bday.email.p1Adult${band}${who}`, { name })
  const hk = h === 'active' ? 'Active' : h === 'returning' ? 'Returning' : 'New'
  const p2 = band === 'kid' ? t(`bday.email.p2Kid${hk}`) : t(`bday.email.p2Adult${hk}${who}`, { name })
  const btn = sw.active
    ? { label: sw.self ? t('bday.email.btnMine') : t('bday.email.btnProgress', { name }), href: `${site}/dashboard` }
    : { label: t('bday.email.btnBook'), href: `${site}/booking` }

  // A test card goes to staff: its link must not be able to unsubscribe the
  // family it was made from, so it points at the page without a token.
  const token = opts.test ? null : unsubscribeToken(opts.parentId)
  const unsub = token ? unsubscribePageUrl(opts.parentId, token) : `${site}/unsubscribe`
  const address = SCHOOL_MAILING_ADDRESS.trim() || (opts.test ? '(mailing address not set yet)' : '')

  const lane = `<img src="${site}/email/lane-rope.png" width="600" alt="" style="display:block;width:100%;height:auto;border:0;">`
  const html = `<!doctype html><html lang="${L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="format-detection" content="address=no,telephone=no,date=no"><title>${esc(subject)}</title>
<style>a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}@media only screen and (max-width:480px){.big{font-size:112px!important}.h1m{font-size:28px!important}.pad{padding-left:22px!important;padding-right:22px!important}.tkl{display:block!important;width:auto!important;border-right:0!important;border-bottom:3px dashed #ffffff!important;padding:18px 20px!important;text-align:center!important}.tkr{display:block!important;width:auto!important;padding:16px 20px 18px!important;text-align:center!important}}</style></head>
<body style="margin:0;padding:0;background:#fdf3e1;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdf3e1;font-family:${FONT};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td style="background:#ffffff;border-radius:18px 18px 0 0;padding:0;"><img src="${site}/email/birthday-bunting.png" width="600" alt="" style="display:block;width:100%;height:auto;border:0;border-radius:18px 18px 0 0;"></td></tr>
<tr><td style="background:#ffffff;padding:0 36px;" align="center">
  ${hero}
  <div class="h1m" style="color:${NAVY};font-size:34px;line-height:1.15;font-weight:800;margin-top:10px;">${title}</div>
  <div style="color:${MUTED};font-size:17px;margin-top:8px;">${sub}</div></td></tr>
<tr><td style="background:#ffffff;padding:22px 0 0;">${lane}</td></tr>
<tr><td class="pad" style="background:#ffffff;padding:22px 36px 6px;">
  <p style="margin:0 0 12px;color:${INK};font-size:16px;line-height:1.7;">${hi}</p>
  <p style="margin:0 0 12px;color:${INK};font-size:16px;line-height:1.7;">${p1}</p>
  <p style="margin:0;color:${INK};font-size:16px;line-height:1.7;">${p2}</p></td></tr>
<tr><td class="pad" style="background:#ffffff;padding:24px 36px 4px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${ORANGE};border-radius:14px;"><tr>
   <td class="tkl" valign="middle" style="padding:20px 22px;border-right:3px dashed #ffffff;">
     <div style="color:${NAVY};font-size:12px;font-weight:900;letter-spacing:3px;text-transform:uppercase;">${t('bday.email.ticket')}</div>
     <div style="color:${NAVY};font-size:24px;font-weight:900;margin-top:4px;">${t('bday.email.ticketLine')}</div>
     <div style="color:#5a3a00;font-size:14px;margin-top:4px;">${t('bday.email.ticketBody')}</div></td>
   <td class="tkr" width="190" valign="middle" align="center" style="padding:20px 14px;">
     <div style="color:#ffffff;font-size:36px;font-weight:900;line-height:1;">${t('bday.email.points', { n: opts.points })}</div>
     <div style="color:${NAVY};font-size:12px;font-weight:700;margin-top:6px;">${t('bday.email.valid', { date: expires })}</div></td>
  </tr></table></td></tr>
<tr><td class="pad" style="background:#ffffff;padding:20px 36px 6px;"><div style="font-family:${SERIF};font-style:italic;color:${NAVY};font-size:19px;">&mdash; ${t('bday.email.sign')}</div></td></tr>
<tr><td class="pad" align="center" style="background:#ffffff;padding:24px 36px 30px;"><a href="${btn.href}" style="display:inline-block;background:${NAVY};color:#ffffff;font-size:15px;font-weight:800;padding:14px 30px;border-radius:10px;text-decoration:none;">${btn.label}</a></td></tr>
<tr><td style="padding:0;">${lane}</td></tr>
<tr><td class="pad" style="background:${NAVY};padding:26px 36px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="112" valign="middle" style="padding-right:18px;">
      <a href="${site}" style="display:block;background:#ffffff;border-radius:12px;padding:8px;"><img src="${site}/email-logo.png" width="96" alt="Manta Shark Aquatics" style="display:block;width:96px;height:auto;border:0;"></a></td>
    <td valign="middle" style="border-left:1px solid #2c4475;padding-left:18px;color:#ffffff;font-size:14px;line-height:1.6;">
      <div style="font-weight:700;">${t('bday.email.foot')}</div>
      <div style="margin-top:4px;font-size:13px;"><a href="mailto:${CONTACT_EMAIL}" style="color:#f0b44d;text-decoration:none;">${CONTACT_EMAIL}</a></div>
      <div style="font-size:13px;"><a href="${site}" style="color:#f0b44d;text-decoration:none;">mantasharkaquatics.net</a></div></td>
  </tr></table>
  <div style="height:1px;background:#2c4475;margin:22px 0 16px;line-height:1px;font-size:1px;">&nbsp;</div>
  <div style="color:#8fa1c4;font-size:12px;line-height:1.7;text-align:center;">${t('bday.email.why')} <a href="${unsub}" style="color:#c9d3e6;text-decoration:underline;">${t('bday.email.unsubscribe')}</a>${address ? `<br><span style="color:#8fa1c4;text-decoration:none;">Manta Shark Aquatics &middot; ${esc(address).replace(/ /, '&#8203; ')}</span>` : ''}</div>
</td></tr>
</table></td></tr></table></body></html>`

  return { subject, html, headers: token ? unsubscribeHeaders(opts.parentId, token) : undefined }
}

// ---------------------------------------------------------------------------

function threeMonthsFrom(now: Date): string {
  const d = new Date(now.getTime())
  d.setUTCMonth(d.getUTCMonth() + BIRTHDAY_GIFT_MONTHS)
  return d.toISOString()
}

/** Why a swimmer whose birthday it is gets no card, or null when they do. */
export function skipReason(sw: BirthdaySwimmer): 'not_subscribed' | 'no_email' | null {
  if (!sw.email) return 'no_email'
  if (!sw.subscribed) return 'not_subscribed'
  return null
}

export type RunResult = {
  date: string
  skipped?: 'no_mailing_address' | 'no_unsubscribe_secret'
  sent: number
  alreadyDone: number
  notSubscribed: number
  failed: string[]
}

/** Today's cards. Safe to run again: each step is done once per swimmer per year. */
export async function sendBirthdayCards(svc: Svc, today: string, now: Date = new Date()): Promise<RunResult> {
  const out: RunResult = { date: today, sent: 0, alreadyDone: 0, notSubscribed: 0, failed: [] }
  if (!SCHOOL_MAILING_ADDRESS.trim()) return { ...out, skipped: 'no_mailing_address' }
  if (!unsubscribeToken('check')) return { ...out, skipped: 'no_unsubscribe_secret' }

  const year = Number(today.slice(0, 4))
  const swimmers = await birthdaysBetween(svc, today, today, today)
  for (const sw of swimmers) {
    if (skipReason(sw)) { out.notSubscribed++; continue }
    try {
      const r = await sendOne(svc, sw, year, now)
      if (r === 'done') out.alreadyDone++
      else if (r === 'sent') out.sent++
      else out.failed.push(`${sw.studentId}: email not sent`)
    } catch (e: any) {
      console.error(`birthday card ${sw.studentId}:`, e?.message || e)
      out.failed.push(`${sw.studentId}: ${e?.message || e}`)
    }
  }
  return out
}

async function sendOne(svc: Svc, sw: BirthdaySwimmer, year: number, now: Date): Promise<'sent' | 'done' | 'email_failed'> {
  // 1. The row for this swimmer and year: made once, then only moved forward.
  let { data: row } = await svc.from('birthday_cards').select('id, status, ledger_id').eq('student_id', sw.studentId).eq('year', year).maybeSingle()
  if (row?.status === 'sent') return 'done'
  if (!row) {
    const { data: made, error } = await svc.from('birthday_cards').insert({
      student_id: sw.studentId, parent_id: sw.parentId, year, kind: sw.kind, status: 'pending', email_to: sw.email,
    }).select('id, status, ledger_id').single()
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return 'done' // another run has it
      throw new Error('birthday_cards insert: ' + error.message)
    }
    row = made
  }

  // 2. The gift, once. Looked for in the ledger too, so a run that stopped
  //    between giving the points and noting it does not give them again.
  let ledgerId: string | null = row.ledger_id
  let expiresAt: string | null = null
  if (!ledgerId) {
    const { data: had } = await svc.from('point_ledger').select('id, granted_expires_at')
      .eq('parent_id', sw.parentId).eq('reason', 'birthday_gift')
      .contains('pricing', { kind: 'birthday', studentId: sw.studentId, year }).limit(1)
    if (had && had.length > 0) {
      ledgerId = had[0].id; expiresAt = had[0].granted_expires_at
    } else {
      const res = await applyPoints(svc, {
        parentId: sw.parentId, reason: 'birthday_gift', points: BIRTHDAY_GIFT_POINTS,
        toGranted: true, grantedExpiresAt: threeMonthsFrom(now), actor: 'system',
        note: `Birthday gift for ${sw.fullName}`,
        pricing: { kind: 'birthday', studentId: sw.studentId, year },
      })
      ledgerId = res.ledgerId; expiresAt = res.grantedExpiresAt
    }
    await svc.from('birthday_cards').update({ ledger_id: ledgerId, points: BIRTHDAY_GIFT_POINTS }).eq('id', row.id)
  } else {
    const { data: l } = await svc.from('point_ledger').select('granted_expires_at').eq('id', ledgerId).maybeSingle()
    expiresAt = l?.granted_expires_at ?? null
  }

  // 3. The card.
  const card = renderBirthdayCard(sw, { points: BIRTHDAY_GIFT_POINTS, expiresAt: expiresAt || threeMonthsFrom(now), parentId: sw.parentId })
  const ok = await sendRawEmail({ to: sw.email!, subject: card.subject, html: card.html, headers: card.headers })
  await svc.from('birthday_cards').update(ok
    ? { status: 'sent', sent_at: new Date().toISOString(), email_to: sw.email, error: null }
    : { status: 'email_failed', error: 'email not sent' }).eq('id', row.id)
  return ok ? 'sent' : 'email_failed'
}

/** A test card to a member of staff: no points, no record. */
export async function sendTestCard(sw: BirthdaySwimmer, to: string, now: Date = new Date()): Promise<boolean> {
  const card = renderBirthdayCard(sw, { points: BIRTHDAY_GIFT_POINTS, expiresAt: threeMonthsFrom(now), parentId: sw.parentId, test: true })
  return sendRawEmail({ to, subject: card.subject, html: card.html })
}
