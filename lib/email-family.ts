// The emails a family gets about their lessons, points and account, in the
// family's own language (owner, 2026-10-22: "every email to parents follows
// their language"; SMS and the receipt page itself stay English).
//
// Moved out of lib/email.ts, which still builds the staff and applicant mail
// (English, as staff mail is) and the emails that were already translated
// (welcome, assessment report, monthly report, ...). The words are the `mail.*`
// keys in lib/i18n/locales/<lang>.json; the English there is the text these
// emails always had.
//
// Server only: it reads every dictionary through lib/i18n/all.

import { getT, toLocale, dateTag, tDb, type Locale } from './i18n/all'
import dbStrings from './i18n/locales/db-strings.json'
import { TRIAL_PRICE_CENTS, TRIAL_HOLD_MINUTES } from './plans'
import { formatTime12h } from './date'
import { locationMapUrl, type Location } from './locations'
import type { EmailPayload, EmailType } from './email'
import { icsFile } from './ics'
import { CONTACT_EMAIL } from './site-config'

type T = (key: string, vars?: Record<string, string | number>) => string

export const FAMILY_TYPES: ReadonlySet<EmailType> = new Set<EmailType>([
  'booking_confirmed', 'booking_series_confirmed', 'booking_rescheduled', 'booking_cancelled',
  'block_cancellation_notice', 'reminder_24h', 'trial_payment_link',
  'partner_booking_invite', 'partner_booking_confirmed', 'partner_booking_rejected',
  'partner_invite_expired', 'partner_invite_withdrawn', 'partner_invite_unlinked', 'partner_invite_failed',
  'partner_reschedule_requested', 'partner_reschedule_not_moved', 'partner_absent_lesson_continues',
  'invoice', 'refund_issued', 'referral_reward', 'fixed_class_ended', 'payment_reversed',
  'contact_change_code', 'contact_verify_code', 'contact_change_notice', 'level_certificate', 'waitlist_offer',
  'guardian_invite',
])

/** Family emails a second guardian does NOT get a copy of: codes and notices
 *  about the main account's own login, and the guardian's own invitation. */
const NO_GUARDIAN_COPY: ReadonlySet<EmailType> = new Set<EmailType>([
  'contact_change_code', 'contact_verify_code', 'contact_change_notice', 'guardian_invite',
])

/**
 * The second guardians who get a copy of this family email (owner,
 * 2026-10-22: "all notices"). The family is the one whose main address the
 * email goes to. Before docs/migration-guardians.sql runs the read fails and
 * nobody is copied.
 */
export async function guardianCopies(payload: Pick<EmailPayload, 'type' | 'to'>): Promise<string[]> {
  if (NO_GUARDIAN_COPY.has(payload.type)) return []
  try {
    const { serviceClient } = await import('./api-auth')
    const svc = serviceClient()
    const to = String(payload.to || '').trim().toLowerCase()
    const { data: fam } = await svc.from('parents').select('id').eq('email', to).limit(1).maybeSingle()
    if (!fam) return []
    const { data: g, error } = await svc.from('parent_guardians').select('email')
      .eq('parent_id', (fam as { id: string }).id).is('removed_at', null).not('auth_user_id', 'is', null)
    if (error) return []
    return [...new Set(((g || []) as { email: string }[]).map(r => r.email.trim().toLowerCase()).filter(e => e && e !== to))]
  } catch { return [] }
}

const SITE = 'https://www.mantasharkaquatics.net'

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * The family's language: the one the caller passed, else the account's
 * preferred_language looked up by the address the email goes to, else English.
 * Most senders predate translated mail and pass none, so the lookup is what
 * makes them follow the family.
 */
export async function familyLang(payload: Pick<EmailPayload, 'lang' | 'to'>): Promise<Locale> {
  if (payload.lang) return toLocale(payload.lang)
  try {
    const { serviceClient } = await import('./api-auth')
    const { data } = await serviceClient().from('parents').select('preferred_language')
      .eq('email', String(payload.to || '').trim().toLowerCase()).limit(1).maybeSingle()
    return toLocale((data as { preferred_language?: string } | null)?.preferred_language || 'en')
  } catch { return 'en' }
}

/** A course name as the senders write it ("1-on-1 Private", "... (60 min)",
 *  "Swim Assessment"), in the family's language. */
export function courseIn(L: Locale, t: T, name: string | undefined): string {
  const raw = String(name || '').trim()
  if (!raw || L === 'en') return raw
  if (raw === 'Swim Assessment') return t('mail.course.assessment')
  const hour = / \(60 min\)$/.test(raw)
  const base = hour ? raw.replace(/ \(60 min\)$/, '') : raw
  const db = dbStrings as { course_types: Record<string, Record<string, string>>; team_tiers: Record<string, Record<string, string>> }
  const id = Object.keys(db.course_types).find(k => db.course_types[k].en === base)
  const tierId = id ? undefined : Object.keys(db.team_tiers || {}).find(k => db.team_tiers[k].en === base)
  const local = id ? tDb(L, 'course_types', id, base) : tierId ? tDb(L, 'team_tiers', tierId, base) : base
  return hour ? t('mail.course.min60', { name: local }) : local
}

const dateLong = (L: Locale, d?: string) => d
  ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T00:00:00Z' : d).toLocaleDateString(dateTag(L), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  : ''
const dateDay = (L: Locale, d?: string) => d
  ? new Date(d + 'T12:00:00Z').toLocaleDateString(dateTag(L), { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
  : ''
/** A date some sender already wrote out in English ("October 22, 2027"). */
const reDate = (L: Locale, s?: string) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) || L === 'en' ? s : d.toLocaleDateString(dateTag(L), { year: 'numeric', month: 'long', day: 'numeric' })
}

/** The Location cell: the line, a Map link, the pool's phone and arrival notes. */
export function placeHtml(t: T, line: string, pool: Location | null): string {
  let h = esc(line)
  if (!pool) return h
  const url = locationMapUrl(pool)
  const addr = (pool.address || '').trim()
  const hasAddr = !!addr && addr.toLowerCase() !== pool.name.trim().toLowerCase()
  if (url && (hasAddr || pool.map_url)) h += ` &middot; <a href="${esc(url)}" style="color: #1a5fb4;">${t('mail.place.map')}</a>`
  const ph = String(pool.phone || '').replace(/\D/g, '')
  if (ph.length === 10) h += `<br><span style="font-weight: 400; color: #444;">${t('mail.place.phone')} <a href="tel:+1${ph}" style="color: #1a5fb4;">(${ph.slice(0, 3)}) ${ph.slice(3, 6)}-${ph.slice(6)}</a></span>`
  const notes = String(pool.directions || '').trim()
  if (notes) h += `<br><span style="font-weight: 400; color: #444;">${esc(notes)}</span>`
  return h
}

export type FamilyCtx = {
  pool: Location | null
  poolOfLine: (line: string | undefined) => Promise<Location | null>
}

/** Subject and HTML for one family email, or null for a type not handled here. */
export type MailAttachment = { filename: string; content: string; contentType: string }

/** The calendar files for p.calendar (lib/lesson-calendar.ts): an invitation
 *  for the lessons still on, a cancellation for the ones that are not. A
 *  lesson moved by cancelling and rebooking (a fixed class) has both. */
/** The calendar events for these lessons, in the family's language. */
export function calendarEvents(lessons: NonNullable<EmailPayload['calendar']>, L: Locale) {
  const t = getT(L) as T
  const amp = L === 'en' ? ' & ' : '、'
  return lessons.map(l => ({
    uid: l.uid, date: l.date, start: l.start, minutes: l.minutes,
    title: t('mail.ics.title', { names: l.students.join(amp), course: courseIn(L, t, l.course) }),
    location: l.place ? `Manta Shark Aquatics – ${l.place}` : 'Manta Shark Aquatics',
    description: [l.coach ? t('mail.ics.coach', { coach: l.coach }) : '', `${SITE}/dashboard`].filter(Boolean).join('\n'),
  }))
}

export function calendarAttachments(p: EmailPayload, L: Locale): MailAttachment[] {
  const lessons = p.calendar || []
  if (!lessons.length || !p.to) return []
  const file = (method: 'REQUEST' | 'CANCEL', ls: typeof lessons): MailAttachment => ({
    filename: method === 'CANCEL' ? 'cancelled-lesson.ics' : 'lesson.ics',
    contentType: `text/calendar; charset=UTF-8; method=${method}`,
    content: icsFile({ method, organizer: { name: 'Manta Shark Aquatics', email: CONTACT_EMAIL }, attendee: p.to, events: calendarEvents(ls, L) }),
  })
  const live = lessons.filter(l => !l.cancelled)
  const gone = lessons.filter(l => l.cancelled)
  return [...(live.length ? [file('REQUEST', live)] : []), ...(gone.length ? [file('CANCEL', gone)] : [])]
}

/** The note under an email's details when it carries an invitation. */
export function calendarNote(L: Locale): string {
  return `<p style="color: #56647d; font-size: 13px; text-align: center; margin: 0 0 12px;">📅 ${getT(L)('mail.ics.note')}</p>`
}

/** Puts the note before the email's footer line, or at the end. */
export function withCalendarNote(html: string, L: Locale): string {
  const foot = html.lastIndexOf('<p style="color: #666; font-size: 13px; text-align: center;">')
  const at = foot >= 0 ? foot : html.lastIndexOf('</div>')
  return at >= 0 ? html.slice(0, at) + calendarNote(L) + html.slice(at) : html + calendarNote(L)
}

export async function familyEmail(p: EmailPayload, L: Locale, ctx: FamilyCtx): Promise<{ subject: string; html: string; attachments?: MailAttachment[] } | null> {
  const r = await familyEmailBody(p, L, ctx)
  if (!r) return null
  const files = calendarAttachments(p, L)
  if (!files.length) return r
  const invite = files.some(f => f.contentType.endsWith('REQUEST'))
  return { ...r, html: invite ? withCalendarNote(r.html, L) : r.html, attachments: files }
}

async function familyEmailBody(p: EmailPayload, L: Locale, ctx: FamilyCtx): Promise<{ subject: string; html: string } | null> {
  const t = getT(L) as T
  const sep = L === 'en' ? ' ' : ''
  const amp = L === 'en' ? ' & ' : '、'
  const course = courseIn(L, t, p.courseName)
  const date = dateLong(L, p.date)
  const student = esc(p.studentName)

  const row = (label: string, value: string) => `<tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">${label}</td><td style="padding: 8px 0; font-weight: 600;">${value}</td></tr>`
  const locRow = p.location ? row(t('mail.row.location'), placeHtml(t, p.location, ctx.pool)) : ''
  const para = (s: string, style = '') => `<p${style ? ` style="${style}"` : ''}>${s}</p>`
  const button = (href: string, label: string, bg = '#c9a84c', fg = '#1a2744') =>
    `<div style="text-align: center; margin-top: 24px;"><a href="${esc(href)}" style="display: inline-block; background: ${bg}; color: ${fg}; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">${label}</a></div>`
  const footer = `<p style="color: #666; font-size: 13px; text-align: center;">${t('mail.footer', { site: `<a href="${SITE}">mantasharkaquatics.net</a>` })}</p>`
  const shell = (title: string, inner: string, withFooter = true) =>
    `<div lang="${L}" style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">${title}</h2>${para(t('assess.email.hi', { name: esc(p.parentName || '') }))}${inner}</div>${withFooter ? footer : ''}</div>`
  const table = (rows: string) => `<table style="width: 100%; border-collapse: collapse;">${rows}</table>`
  const R = {
    student: () => row(t('mail.row.student'), student),
    partner: () => (p.partnerName ? row(t('mail.row.partner'), esc(p.partnerName)) : ''),
    course: () => row(t('mail.row.course'), esc(course)),
    coach: () => row(t('mail.row.coach'), esc(p.coachName)),
    date: () => row(t('mail.row.date'), date),
    time: () => row(t('mail.row.time'), esc(p.time)),
  }
  const lessonTable = (opts: { student?: boolean; partner?: boolean; coach?: boolean } = {}) => table(
    (opts.student === false ? '' : R.student()) + (opts.partner ? R.partner() : '') + R.course()
    + (opts.coach === false ? '' : R.coach()) + R.date() + R.time() + locRow)
  const swimmer = student || t('mail.yourSwimmer')
  const bookAny = para(t('mail.bookAny'), 'margin-top: 16px;')

  switch (p.type) {
    case 'booking_confirmed':
      return {
        subject: t('mail.booked.subject', { course, date }),
        html: shell(t('mail.booked.title'), para(t('mail.booked.intro')) + lessonTable({ partner: true })),
      }

    case 'booking_rescheduled':
      return {
        subject: t('mail.moved.subject', { course, date }),
        html: shell(t('mail.moved.title'), para(t('mail.moved.intro')) + table(R.student() + R.course() + R.coach()
          + row(t('mail.row.newDate'), date) + row(t('mail.row.newTime'), esc(p.time)) + locRow)),
      }

    case 'reminder_24h':
      return {
        subject: t('mail.remind.subject', { course, time: String(p.time || '').split(/\s[–-]\s/)[0] }),
        html: shell(t('mail.remind.title'), para(t('mail.remind.body', { student })) + lessonTable() + para(t('mail.remind.after'))),
      }

    case 'trial_payment_link': {
      const price = `$${Number(p.amount ?? TRIAL_PRICE_CENTS / 100)}`
      const by = p.deadline ? t('mail.trialLink.by', { time: esc(p.deadline) }) : ''
      return {
        subject: t('mail.trialLink.subject', { price }),
        html: shell(t('mail.trialLink.title'),
          para(t('mail.trialLink.body', { student, minutes: TRIAL_HOLD_MINUTES, by }))
          + table(R.student() + R.course() + R.coach() + R.date() + R.time() + locRow + row(t('mail.row.price'), price))
          + button(p.paymentUrl || SITE, t('mail.trialLink.button'))),
      }
    }

    case 'booking_cancelled':
    case 'block_cancellation_notice': {
      const rk = p.refundKind
      if (rk === 'assessment' || (rk === 'assessment_refunded' && p.type === 'booking_cancelled')) {
        const note = rk === 'assessment'
          ? t('mail.assessCancel.kept')
          : t('mail.assessCancel.refunded', { link: `<a href="${SITE}/booking" style="color: #1a2744;">mantasharkaquatics.net/booking</a>` })
        return {
          subject: t('mail.assessCancel.subject', { date }),
          html: shell(t('mail.assessCancel.title'), para(t('mail.assessCancel.intro'))
            + table(R.student() + R.date() + R.time() + locRow) + para(note, 'color: #c9a84c; font-weight: 600;')),
        }
      }
      if (p.type === 'block_cancellation_notice') {
        const refund = rk === 'none' ? '' : rk === 'voucher' ? t('mail.block.refundVoucher') : t('mail.block.refundPoints')
        return {
          subject: t('mail.cancel.subject', { course, date }),
          html: shell(t('mail.block.title'),
            para([t('mail.block.body', { coach: esc(p.coachName) }), refund].filter(Boolean).join(sep))
            + lessonTable() + para(t('mail.block.after'), 'margin-top: 16px;')),
        }
      }
      const kind = rk || 'points'
      const pc = p.partnerCancelled
      const cancelLine = pc
        ? t('mail.cancel.partner', { with: p.partnerName ? t('mail.cancel.with', { name: esc(p.partnerName) }) : '' })
        : kind === 'none' ? t('mail.cancel.none')
        : kind === 'voucher' && p.voucherBack ? t('mail.cancel.voucherBack')
        : kind === 'voucher' ? t('mail.cancel.voucher')
        : t('mail.cancel.points')
      const voucherBy = p.expiresOn ? dateDay(L, p.expiresOn) : ''
      const readyLine = pc
        ? [kind === 'points' ? (p.amount ? t('mail.ready.partnerPointsN', { n: Number(p.amount) }) : t('mail.ready.partnerPoints')) : '', t('mail.ready.partner')].filter(Boolean).join(sep)
        : kind === 'none' ? t('mail.ready.none')
        : kind === 'voucher'
          ? (p.usableFrom && voucherBy ? t('mail.ready.voucherWindow', { from: dateDay(L, p.usableFrom), to: voucherBy })
            : voucherBy ? t('mail.ready.voucherBy', { date: voucherBy }) : t('mail.ready.voucher'))
        : t('mail.ready.points')
      return {
        subject: t('mail.cancel.subject', { course, date }),
        html: shell(t('mail.cancel.title'), para(cancelLine) + lessonTable({ coach: false })
          + para(readyLine, 'color: #c9a84c; font-weight: 600;')),
      }
    }

    case 'partner_absent_lesson_continues':
      return {
        subject: t('mail.goesAhead.subject', { course, date }),
        html: shell(t('mail.goesAhead.title'), para(t('mail.goesAhead.body', { student: swimmer })) + lessonTable()
          + para(t('mail.goesAhead.after'), 'color: #666;')),
      }

    case 'partner_booking_invite':
      return {
        subject: t('mail.invite.subject', { inviter: p.inviterName || '', student: p.studentName || '' }),
        html: shell(t('mail.invite.title'),
          para(t('mail.invite.body', { inviter: esc(p.inviterName), student })) + lessonTable()
          + button(`${SITE}/dashboard`, t('mail.invite.button'), '#7b61c4', 'white')
          + para(t('mail.invite.note1'), 'color: #999; font-size: 12px; margin-top: 16px;')
          + para(t('mail.invite.note2'), 'color: #999; font-size: 12px; margin-top: 8px;'), false),
      }

    case 'partner_booking_confirmed':
      return {
        subject: t('mail.inviteOk.subject', { student: p.studentName || '', course, date }),
        html: shell(t('mail.inviteOk.title'), para(t('mail.inviteOk.body', { student })) + table(R.course() + R.coach() + R.date() + R.time() + locRow), false),
      }

    case 'partner_booking_rejected':
      return {
        subject: t('mail.inviteNo.subject', { student: p.studentName || '', course, date }),
        html: shell(t('mail.inviteNo.title'), para(t('mail.inviteNo.body', { student })) + table(R.course() + R.date() + R.time() + locRow)
          + para(t('mail.inviteNo.after'), 'color: #666;'), false),
      }

    case 'partner_invite_expired':
      return {
        subject: t('mail.inviteExpired.subject', { course, date }),
        html: shell(t('mail.inviteExpired.title'), para(t('mail.inviteExpired.body')) + lessonTable()
          + para(t('mail.inviteExpired.after'), 'margin-top: 16px;') + button(`${SITE}/dashboard`, t('mail.btn.dashboard'), '#1a2744', 'white')),
      }

    case 'partner_invite_withdrawn':
      return {
        subject: t('mail.inviteWithdrawn.subject', { course, date }),
        html: shell(t('mail.inviteWithdrawn.title'),
          para(t('mail.inviteWithdrawn.body', { inviter: p.inviterName ? esc(p.inviterName) : t('mail.otherFamilyCap'), student: swimmer }))
          + table(R.course() + R.date() + R.time() + locRow) + bookAny),
      }

    case 'partner_invite_unlinked':
      return {
        subject: t('mail.inviteCancelled.subject', { course, date }),
        html: shell(t('mail.inviteCancelled.title'),
          para(t('mail.inviteUnlinked.body', { partner: p.partnerName ? esc(p.partnerName) : t('mail.otherFamily'), student: swimmer }))
          + table(R.course() + R.date() + R.time() + locRow) + bookAny),
      }

    case 'partner_invite_failed': {
      const r = p.inviteFailReason
      const mine = p.isInviter
      const why = r === 'slot_taken' ? t('mail.inviteFailed.why.slotTaken')
        : r === 'slot_full' ? t('mail.inviteFailed.why.slotFull')
        : r === 'swimmer_busy' ? t('mail.inviteFailed.why.busy', { names: p.busyNames ? esc(p.busyNames) : t('mail.inviteFailed.oneSwimmer') })
        : r === 'inviter_points' ? t(mine ? 'mail.inviteFailed.why.pointsMine' : 'mail.inviteFailed.why.pointsTheirs')
        : r === 'too_late' ? t('mail.inviteFailed.why.tooLate')
        : t('mail.inviteFailed.why.coach')
      const lead = mine
        ? t('mail.inviteFailed.leadMine', { who: p.partnerName ? t('mail.inviteFailed.familyOf', { name: esc(p.partnerName) }) : t('mail.otherFamilyCap'), why })
        : t('mail.inviteFailed.leadTheirs', { inviter: p.inviterName ? esc(p.inviterName) : t('mail.otherFamily'), why })
      return {
        subject: t('mail.inviteCancelled.subject', { course, date }),
        html: shell(t('mail.inviteCancelled.title'),
          para([lead, t('mail.inviteFailed.after', { student: swimmer })].join(sep))
          + table(R.course() + R.date() + R.time() + locRow)
          + para(r === 'inviter_points' && mine ? t('mail.inviteFailed.topUp') : t('mail.bookAnother'), 'margin-top: 16px;')),
      }
    }

    case 'partner_reschedule_requested': {
      const newWhen = `${dateLong(L, p.newDate)}${p.newTime ? ', ' + esc(p.newTime) : ''}`
      const nowWhen = `${date}${p.time ? ', ' + esc(p.time) : ''}`
      return {
        subject: t('mail.resched.subject', { course, date: dateLong(L, p.newDate) || date }),
        html: shell(t('mail.resched.title'),
          para(t('mail.resched.body', { name: p.requesterStudentName ? esc(p.requesterStudentName) : t('mail.resched.yourPartner') }))
          + table(row(t('mail.row.yourSwimmer'), esc(p.partnerStudentName)) + row(t('mail.row.partner'), esc(p.requesterStudentName))
            + R.course() + row(t('mail.row.coachAtNew'), esc(p.coachName)) + row(t('mail.row.currentTime'), nowWhen)
            + row(t('mail.row.proposedTime'), newWhen) + (p.location ? row(t('mail.row.locationAtNew'), esc(p.location)) : ''))
          + para(t('mail.resched.deadline', { by: p.deadline ? t('mail.trialLink.by', { time: esc(p.deadline) }) : '' }), 'color: #c9a84c; font-weight: 600;')
          + button(`${SITE}/dashboard`, t('mail.resched.button'), '#1a2744', 'white')
          + para(t('mail.resched.note'), 'color: #999; font-size: 12px; margin-top: 16px;'), false),
      }
    }

    case 'partner_reschedule_not_moved': {
      const o = p.rescheduleOutcome
      const why = t('mail.notMoved.why.' + (o === 'declined' || o === 'withdrawn' || o === 'expired' || o === 'too_late' || o === 'coach_unavailable' ? o : 'unavailable'))
      const proposed = `${dateLong(L, p.newDate)}${p.newTime ? ', ' + esc(p.newTime) : ''}`
      return {
        subject: t('mail.notMoved.subject', { course, date }),
        html: shell(t('mail.notMoved.title'),
          para(why + (proposed ? t('mail.notMoved.proposed', { when: proposed }) : ''))
          + para(t('mail.notMoved.stays'))
          + table(R.student() + R.partner() + R.course() + R.coach() + R.date() + R.time() + locRow)
          + para(t('mail.notMoved.after'), 'color: #666;')),
      }
    }

    case 'invoice': {
      const n = esc(p.invoiceNumber)
      return {
        subject: t('mail.receipt.subject', { n: p.invoiceNumber || '' }),
        html: shell(t('mail.receipt.title', { n }),
          para([t('mail.receipt.body'), p.invoiceUrl ? t('mail.receipt.withLink') : t('mail.receipt.noLink')].join(sep))
          + table(row(t('mail.row.receiptNo'), n) + `<tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">${t('mail.row.amountPaid')}</td><td style="padding: 8px 0; font-weight: 600; color: #c9a84c;">$${Number(p.amount).toFixed(2)}</td></tr>`)
          + `<div style="margin-top: 20px; text-align: center;">${p.invoiceUrl ? `<a href="${esc(p.invoiceUrl)}" style="background: #c9a84c; color: #1a2744; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; display: inline-block; margin: 0 4px 8px;">${t('mail.receipt.button')}</a>` : ''}<a href="${SITE}/dashboard" style="background: #1a2744; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block; margin: 0 4px 8px;">${t('mail.btn.dashboard')}</a></div>`),
      }
    }

    case 'refund_issued': {
      const money = (v: number) => `<strong>$${v.toFixed(2)}</strong>`
      const total = Number(p.amount ?? 0)
      const hand = Number(p.handBackAmount ?? 0)
      const zelle = Math.min(hand, Number(p.zelleBackAmount ?? 0))
      const cash = hand - zelle
      const card = total - hand
      return {
        subject: t('mail.refund.subject', { amount: `$${total.toFixed(2)}` }),
        html: shell(t('mail.refund.title'),
          para(t('mail.refund.body', { amount: money(total) }))
          + (card > 0 ? para(t('mail.refund.card', { amount: money(card) })) : '')
          + (cash > 0 ? para(t('mail.refund.cash', { amount: money(cash) })) : '')
          + (zelle > 0 ? para(t('mail.refund.zelle', { amount: money(zelle) })) : '')
          + para(t('mail.refund.note'), 'color:#666; font-size: 13px; margin-top: 16px;'), false),
      }
    }

    case 'referral_reward': {
      const n = Number(p.amount ?? 0)
      const why = t(p.referralRole === 'referrer' ? 'mail.referral.referrer' : 'mail.referral.referred', { family: esc(p.otherFamily) })
      const until = p.expiresOn ? t('mail.referral.until', { date: esc(reDate(L, p.expiresOn)) }) : ''
      return {
        subject: t('mail.referral.subject', { n }),
        html: shell(t('mail.referral.title', { n }), para(why) + para(t('mail.referral.body', { n, until }))
          + button(`${SITE}/dashboard`, t('mail.referral.button'))),
      }
    }

    case 'fixed_class_ended': {
      const n = Number(p.lessonsReleased ?? 0)
      const amt = Number(p.amount ?? 0)
      const what = p.reason === 'refund' ? t('mail.fixedEnded.refund', { n: amt })
        : p.reason === 'voucher' ? t(amt === 1 ? 'mail.fixedEnded.voucherOne' : 'mail.fixedEnded.voucherMany', { n: amt })
        : ''
      return {
        subject: t('mail.fixedEnded.subject', { course }),
        html: shell(t('mail.fixedEnded.title'),
          para([t(n === 1 ? 'mail.fixedEnded.bodyOne' : 'mail.fixedEnded.bodyMany', { student, course: esc(course), n }), what].filter(Boolean).join(sep))),
      }
    }

    case 'payment_reversed': {
      const owed = Number(p.pointsOwed ?? 0)
      const released = Number(p.lessonsReleased ?? 0)
      const dollars = Number(p.amount ?? 0)
      const list = (p.releasedLessons || []).map(l => {
        const d = new Date(l.date + 'T12:00:00Z').toLocaleDateString(dateTag(L), { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
        const who = (l.studentNames || []).filter(Boolean).join(amp)
        return `<tr><td style="padding: 6px 16px 6px 0; font-weight: 600; white-space: nowrap; vertical-align: top;">${esc(d)} &middot; ${esc(formatTime12h(l.time))}</td><td style="padding: 6px 0; color: #666;">${esc(who)}</td></tr>`
      }).join('')
      const releasedLine = released > 0
        ? para([t(released === 1 ? 'mail.reversed.releasedOne' : 'mail.reversed.releasedMany', { n: released }), list ? t('mail.reversed.listIntro') : ''].filter(Boolean).join(sep))
          + (list ? `<table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">${list}</table>` : '')
        : ''
      return {
        subject: t('mail.reversed.subject', { amount: `$${dollars.toFixed(2)}` }),
        html: shell(t('mail.reversed.title'),
          para([t(p.reversalKind === 'chargeback' ? 'mail.reversed.causeChargeback' : 'mail.reversed.causeFailed'), t('mail.reversed.body')].join(sep))
          + table(row(t('mail.row.amount'), `$${dollars.toFixed(2)}`) + row(t('mail.row.pointsRemoved'), dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })))
          + releasedLine
          + para(owed > 0 ? t('mail.reversed.owed', { n: owed.toLocaleString('en-US') }) : t('mail.reversed.settled'))
          + button(`${SITE}/dashboard?points=1`, t('mail.reversed.button'))
          + para(t('mail.reversed.note'), 'color: #666; font-size: 13px; margin-top: 16px;'), false),
      }
    }

    case 'booking_series_confirmed': {
      const dl = (p.dates as string[] | undefined) || []
      const tl = (p.times as string[] | undefined) || []
      const ll = p.locations || []
      const perDateLoc = ll.length > 0 && new Set(ll.map(x => x || '')).size > 1
      const seriesLoc = perDateLoc ? '' : (p.location || ll[0] || '')
      const seriesPool = seriesLoc === p.location ? ctx.pool : await ctx.poolOfLine(seriesLoc)
      const seriesLocRow = seriesLoc ? row(t('mail.row.location'), placeHtml(t, seriesLoc, seriesPool)) : ''
      const dateRows = dl.map((d, i) => `<tr><td style="padding: 6px 0; color: #666;">${t('mail.series.lessonN', { n: i + 1 })}</td><td style="padding: 6px 0; font-weight: 600;">${dateLong(L, d)}${tl[i] ? ` &middot; ${esc(tl[i])}` : ''}${perDateLoc && ll[i] ? ` &middot; ${esc(ll[i])}` : ''}</td></tr>`).join('')
      const fixed = p.seriesKind === 'fixed'
      const one = dl.length === 1
      const kind = fixed ? 'fixed' : one ? 'one' : 'many'
      return {
        subject: t('mail.series.subject.' + kind, { n: dl.length, course, date: dateLong(L, dl[0]) }),
        html: shell(t('mail.series.title.' + kind),
          para(fixed ? t('mail.series.intro.fixed', { student }) : one ? t('mail.booked.intro') : t('mail.series.intro.many', { n: dl.length }))
          + table(R.student() + R.partner() + R.course() + R.coach() + (p.time ? R.time() : '') + seriesLocRow)
          + `<h3 style="color: #1a2744; margin: 20px 0 8px;">${one ? t('mail.series.dateOne') : t('mail.series.dateMany', { n: dl.length })}</h3>`
          + table(dateRows)),
      }
    }

    case 'contact_change_code':
      return {
        subject: t('mail.code.subject'),
        html: shell(t('mail.code.title'), para(t('mail.code.body'))
          + `<div style="text-align:center; margin: 24px 0;"><span style="display:inline-block; font-size: 32px; letter-spacing: 8px; font-weight: 700; color:#1a2744; background:#f1f1f1; padding: 14px 24px; border-radius: 8px;">${esc(p.code)}</span></div>`
          + para(t('mail.code.note'), 'color:#666; font-size: 13px;'), false),
      }

    case 'waitlist_offer': {
      // A place opened and is held for this family (lib/waitlist.ts).
      const team = p.waitKind === 'team'
      return {
        subject: t(team ? 'mail.wait.subjectTeam' : 'mail.wait.subject', { student: p.studentName || '', course }),
        html: shell(t('mail.wait.title'),
          para(t(team ? 'mail.wait.bodyTeam' : 'mail.wait.body', { student, course: esc(course) }))
          + (team ? '' : lessonTable())
          + para(t('mail.wait.until', { until: `<strong>${esc(p.deadline)}</strong>` }), 'color: #c9a84c; font-weight: 600;')
          + button(p.linkUrl || `${SITE}/booking`, t(team ? 'mail.wait.buttonTeam' : 'mail.wait.button'))
          + para(t('mail.wait.note'), 'color: #666; font-size: 13px; margin-top: 16px;')),
      }
    }

    case 'level_certificate': {
      // A promotion the school approved (lib/certificates.ts).
      const lv = Number(p.level)
      return {
        subject: t('mail.cert.subject', { name: p.studentName || '', n: lv }),
        html: shell(t('mail.cert.title'),
          para(t('mail.cert.body', { student, n: lv, level: esc(t(`level.${lv}.name`)) }))
          + button(p.linkUrl || `${SITE}/dashboard`, t('mail.cert.button'), '#f09800', '#12254a')
          + para(t('mail.cert.note'), 'color: #666; font-size: 13px; margin-top: 16px;')),
      }
    }

    case 'guardian_invite':
      // The main account added a second guardian (owner, 2026-10-22). The
      // link sets their password on the same page families reset it on.
      return {
        subject: t('mail.guardian.subject', { name: p.inviterName || '' }),
        html: shell(t('mail.guardian.title'),
          para(t('mail.guardian.body', { name: `<strong>${esc(p.inviterName)}</strong>` }))
          + para(t('mail.guardian.can'))
          + button(p.resetUrl || `${SITE}/login`, t('mail.guardian.button'))
          + para(t('mail.guardian.signin', { email: `<strong>${esc(p.to)}</strong>` }))
          + para(t('mail.guardian.note', { name: esc(p.inviterName) }), 'color:#666; font-size: 13px;'), false),
      }

    case 'contact_verify_code':
      // The family is changing their email themselves (owner, 2026-10-22):
      // the code goes to the NEW address, to prove it is theirs and typed right.
      return {
        subject: t('mail.verify.subject'),
        html: shell(t('mail.verify.title'), para(t('mail.verify.body', { value: `<strong>${esc(p.newValue)}</strong>` }))
          + `<div style="text-align:center; margin: 24px 0;"><span style="display:inline-block; font-size: 32px; letter-spacing: 8px; font-weight: 700; color:#1a2744; background:#f1f1f1; padding: 14px 24px; border-radius: 8px;">${esc(p.code)}</span></div>`
          + para(t('mail.verify.note'), 'color:#666; font-size: 13px;'), false),
      }

    case 'contact_change_notice': {
      const f = p.changeField === 'email' ? 'email' : 'phone'
      return {
        subject: t('mail.changed.subject.' + f),
        html: shell(t('mail.changed.title.' + f), para(t('mail.changed.body.' + f, { value: `<strong>${esc(p.newValue)}</strong>` }))
          + para(t('mail.changed.note'), 'color:#666; font-size: 13px;'), false),
      }
    }
  }
  return null
}
