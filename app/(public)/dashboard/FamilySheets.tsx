'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

/* The family's sheets that 首頁 and 我的 both open (owner, 2026-11-04: from
   我的 they open over 我的 itself, not over 首頁): the suggestion box, the
   points card with its statement, and the refer-a-friend card. Moved out of
   the dashboard page as they were. */
import { useEffect, useRef, useState } from 'react'
import { useLocale, useT } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { BRAND, FONT_DISPLAY } from '@/lib/brand'
import ZellePay from '@/components/ZellePay'
import SettleArrearsButton from '@/components/SettleArrearsButton'
import { fmtDate } from '@/lib/fmt-date'
import { useDialogFocus } from '@/lib/use-dialog-focus'

const NAVY = BRAND.navy
const GOLD = BRAND.blue
const AMBER = BRAND.amber
function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
const INTL_LOCALE: Record<string, string> = { en: 'en-US', 'zh-Hant': 'zh-TW', 'zh-Hans': 'zh-CN' }
const intlOf = (locale: string) => INTL_LOCALE[locale] || 'en-US'

/** The suggestion box: one optional message to the managers, any time. */
export function SuggestionSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'confirm' | 'sending' | 'done' | 'error' | 'many'>('idle')
  // Focus in and back out; Esc is handled below (50-role test, 2026-11-05).
  const suggestBox = useDialogFocus(true)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  async function send() {
    if (!text.trim()) return
    setState('sending')
    const r = await fetch('/api/parent/suggestions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }),
    }).catch(() => null)
    setState(r && r.ok ? 'done' : r && r.status === 429 ? 'many' : 'error')
  }
  /* A tap on the dim area closes only an empty sheet (found 2026-10-15). On a
     phone that tap is how people put the keyboard away, and it threw the draft
     away with no warning. ✕, Close and Escape still close it on purpose. */
  const keep = !!text.trim() && state !== 'done'
  return (
    <div className="msa-sheet-back" onClick={() => { if (!keep) onClose() }}>
      <div ref={suggestBox} className="msa-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('suggest.link')}>
        <div className="msa-sheet-head">
          <b>{t('suggest.link')}</b>
          <button className="msa-sheet-x" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        {state === 'done' ? (
          <div style={{ textAlign: 'center', padding: '18px 0 8px' }}>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1f7a57' }}>{t('suggest.thanks')}</p>
            <button onClick={onClose} style={{ marginTop: '16px', border: 0, borderRadius: '10px', padding: '11px 26px', background: AMBER, color: NAVY, fontWeight: 800, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
              {t('common.close')}
            </button>
          </div>
        ) : (<>
          <p style={{ margin: '0 0 10px', fontSize: '13.5px', color: '#56647d', lineHeight: 1.6 }}>{t('suggest.intro')}</p>
          <textarea value={text} onChange={e => setText(e.target.value.slice(0, 2000))} rows={6} autoFocus
            placeholder={t('suggest.placeholder')} aria-label={t('suggest.title')}
            style={{ width: '100%', borderRadius: '12px', border: '1px solid #d5deeb', padding: '12px', fontSize: '16px', fontFamily: 'inherit', color: '#16294a', resize: 'vertical', boxSizing: 'border-box', background: '#fff' }} />
          {state === 'error' && <p style={{ margin: '8px 0 0', fontSize: '12.5px', color: '#c0563f' }}>{t('suggest.error')}</p>}
          {state === 'many' && <p style={{ margin: '8px 0 0', fontSize: '12.5px', color: '#c0563f' }}>{t('suggest.tooMany')}</p>}
          {/* Asked once more before it goes (owner, 2026-11-04: a tap by
              mistake sent it). */}
          {state === 'confirm' ? (
            <div role="alertdialog" aria-label={t('suggest.confirm')} style={{ marginTop: '12px', background: '#fff', border: '1px solid #e3ebf6', borderRadius: '12px', padding: '14px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 800, color: '#12254a' }}>{t('suggest.confirm')}</p>
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#56647d', lineHeight: 1.5 }}>{t('suggest.confirmBody')}</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setState('idle')}
                  style={{ flex: 1, border: '1px solid #d5deeb', borderRadius: '10px', padding: '11px', background: '#fff', color: '#56647d', fontWeight: 800, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {t('suggest.back')}
                </button>
                <button type="button" onClick={send}
                  style={{ flex: 1, border: 0, borderRadius: '10px', padding: '11px', background: AMBER, color: NAVY, fontWeight: 800, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {t('suggest.send')}
                </button>
              </div>
            </div>
          ) : (
          <button onClick={() => setState('confirm')} disabled={!text.trim() || state === 'sending'}
            style={{ marginTop: '12px', width: '100%', border: 0, borderRadius: '12px', padding: '13px', background: text.trim() ? AMBER : '#e3ebf6', color: text.trim() ? NAVY : '#8592a8', fontWeight: 800, fontSize: '15px', cursor: text.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            {state === 'sending' ? t('suggest.sending') : t('suggest.send')}
          </button>
          )}
          <p style={{ margin: '10px 0 0', textAlign: 'center', fontSize: '11.5px', color: '#667690' }}>{t('suggest.note')}</p>
        </>)}
      </div>
    </div>
  )
}

export type WalletSummary = {
  balance: number
  balancePurchased: number
  balanceGranted: number
  /** Points owed after a bank return or a dispute. Zero for almost everyone. */
  arrears: number
  /** The next date some granted points expire, and how many. */
  grantedNextExpiry: { date: string; points: number } | null
  lessonsCompleted: number
  forgiveness: number
  lessonsPerForgiveness: number
  /** Set only when the points will not last two more weeks of this family's
   *  lessons (lib/low-balance.ts). `popup`: the one-time notice is still due. */
  runway?: { weeksLeft: number; balance?: number; popup?: boolean } | null
}
const SYSTEM_ONLY_NOTES = new Set([
  'Lesson cancelled by the school',
  // The line's own label already says it ("cancelled by the school",
  // "returned"); these showed as English on a Chinese page (found 2026-10-07).
  'Coach unavailable', 'Refund retried by the desk',
  'booking insert failed', 'second swimmer could not be booked',
  'the time filled up', 'the time slot could not be created', 'the booking could not be written',
  'the partner invitation could not be written', 'a booking row could not be written',
  // The rest of the rollback reasons: 1-on-2 acceptance, weekly batch and the
  // desk's booking page (found 2026-10-15).
  'the inviting family could not pay', 'the lesson could not be confirmed',
  'the invitation was already processed', 'the lessons could not be booked',
  'the other side of the booking could not pay', 'one half of the hour was already taken',
  'a session could not be created', 'a class filled up', 'the two families could not be linked',
])

type LedgerRow = {
  id: string
  at: string
  points: number
  /** Null on a payment line: it did not move the balance. */
  balanceAfter: number | null
  reason: string
  note: string | null
  amountCents: number | null
  invoice?: { id: string; number: string } | null
  /** The lesson a booking or refund line was about, when the server knows it. */
  lesson?: { student: string | null; date: string; time: string | null; count: number } | null
  /** A dollar payment that bought no points -- the Swim Assessment. */
  payment?: boolean
  /** A late cancellation's information line: points that were not returned. */
  kept?: number
}

/** The wallet, as one card. */
export function PointsCard({ w, onBuy, zelle, historyFirst = false }: { w: WalletSummary | null; onBuy: () => void; zelle?: boolean; historyFirst?: boolean }) {
  const t = useT()
  const locale = useLocale()
  // 我的 › 點數明細 opens the card with the statement already open.
  const [showHistory, setShowHistory] = useState(historyFirst)
  const [histPage, setHistPage] = useState(0)
  /* The statement is read when it is opened, not with the page, and older
     lines a batch at a time as the family pages back (found 2026-10-08: only
     the newest 12 were ever fetched, so an older purchase -- and its receipt,
     which the invoice email sends families here for -- could not be reached).
     nextBefore is where the next batch starts; null once there is no more. */
  const [history, setHistory] = useState<LedgerRow[] | null>(null)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [histBusy, setHistBusy] = useState(false)
  const [histFailed, setHistFailed] = useState(false)
  // Where a swipe began. A ref, not state: it changes on every touchmove and
  // nothing on screen depends on it.
  const swipeFrom = useRef<{ x: number; y: number } | null>(null)
  // Only the newest read may write: closing and reopening starts again.
  const histSeq = useRef(0)
  const HIST_BATCH = 20
  async function loadHistory(before: string | null): Promise<LedgerRow[] | null> {
    const seq = ++histSeq.current
    setHistBusy(true)
    setHistFailed(false)
    try {
      const r = await fetch('/api/parent/wallet?only=history&history=' + HIST_BATCH + (before ? '&before=' + encodeURIComponent(before) : ''), { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json() as { history?: LedgerRow[]; nextBefore?: string | null }
      if (seq !== histSeq.current) return null
      const got = j.history || []
      // Appended to what this render shows: a later batch is only asked for
      // from the arrow on the last page loaded.
      const base = before && history ? history : []
      const seen = new Set(base.map(x => x.id))
      const all = [...base, ...got.filter(x => !seen.has(x.id))]
      setHistory(all)
      setNextBefore(j.nextBefore ?? null)
      return all
    } catch {
      if (seq === histSeq.current) setHistFailed(true)
      return null
    } finally {
      if (seq === histSeq.current) setHistBusy(false)
    }
  }

  /* The ledger is every movement of money, for ever. Left whole it was longer
     than the rest of the dashboard put together and pushed the lesson history
     off the bottom of the page. Ten at a time; the arrow past the last page
     loaded fetches the next batch. */
  const HIST_PER_PAGE = 10
  const rows = history ?? []
  const pageCount = Math.max(1, Math.ceil(rows.length / HIST_PER_PAGE))
  // Clamped rather than stored: the list can shrink under a reload, and page 4
  // of a two-page list renders as an empty card with no explanation.
  const page = Math.min(histPage, pageCount - 1)
  const pageRows = rows.slice(page * HIST_PER_PAGE, (page + 1) * HIST_PER_PAGE)
  const hasNext = page < pageCount - 1 || !!nextBefore
  const goPage = async (n: number) => {
    if (n < 0 || histBusy) return
    if (n > pageCount - 1) {
      if (!nextBefore) return
      const all = await loadHistory(nextBefore)
      if (!all) return
      setHistPage(Math.min(n, Math.max(0, Math.ceil(all.length / HIST_PER_PAGE) - 1)))
      return
    }
    setHistPage(n)
  }
  const toggleHistory = () => {
    const open = !showHistory
    setShowHistory(open)
    setHistPage(0)
    // Read again on every opening: a booking or a cancel since the last one
    // has added a line.
    if (open) { setHistory(null); setNextBefore(null); loadHistory(null) }
  }
  const firstRead = useRef(historyFirst)
  useEffect(() => {
    if (!firstRead.current) return
    firstRead.current = false
    loadHistory(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on opening
  }, [])
  if (!w) return null

  // Notes the system itself writes are English sentences; these are the ones a
  // family can see. A note a staff member typed is shown as they typed it.
  const noteText = (n: string) => {
    let m: RegExpMatchArray | null
    if ((m = n.match(/^(\d+) lessons? booked$/)) || (m = n.match(/^Cart: (\d+) lessons?$/))) {
      // The lesson detail beside it already says how many; one lesson needs no note.
      return Number(m[1]) === 1 ? '' : t('points.note.lessons', { n: m[1] })
    }
    // Already said by the line's own label ("cancelled by the school", "booking
    // failed, returned"), or written for staff rather than for the family.
    if (SYSTEM_ONLY_NOTES.has(n)) return ''
    if (n === 'rescheduled into a new 1-on-2 invitation') return t('points.note.movedTo1on2')
    if (n === 'the other family cancelled this 1-on-2') return t('points.note.partnerCancelled')
    if ((m = n.match(/^Bonus on a \$([\d,]+) desk purchase$/))) return t('points.note.deskBonus', { amount: '$' + m[1] })
    // A trailing "(why)" is Stripe's reason, written for staff.
    if ((m = n.match(/^Refund of \$([\d.,]+) could not be delivered( \(.*\))?$/))) return t('points.note.refundUndelivered', { amount: '$' + m[1] })
    // A bank return or dispute: the label says which, and the note carries the
    // Stripe payment id, which is not the family's to read (found 2026-10-15).
    if (/^(Bank returned payment|Customer disputed payment) /.test(n)) return ''
    // The yearly gift: the label says "Birthday gift"; the note adds whose.
    if ((m = n.match(/^Birthday gift for (.+)$/))) return t('points.note.forSwimmer', { name: m[1] })
    // A desk SDP sale: "4 × 1-on-1 Private for Ethan Chen — <desk note>". The
    // course name is the English catalogue name; the swimmer is what matters
    // here. Whatever the desk typed after the dash stays as typed.
    if ((m = n.match(/^\d+ × .+? for (.+?)(?: — (.*))?$/))) return t('points.note.forSwimmer', { name: m[1] }) + (m[2] ? ' — ' + m[2] : '')
    // An SDP sale's programme-rate grant. The full note spells out the desk's
    // price against the list price, which is staff wording; the family sees
    // whose programme it was (found 2026-10-07).
    if ((m = n.match(/^Programme rate for (.+?): \d+ × /))) return t('points.note.programmeRate', { name: m[1] })
    return n
  }
  const lessonText = (l: NonNullable<LedgerRow['lesson']>) => {
    const d = fmtDate(new Date(l.date + 'T12:00:00'), locale === 'en' ? 'en-US' : locale, { month: 'numeric', day: 'numeric' })
    const when = l.count > 1 ? t('points.lesson.many', { date: d, n: l.count }) : (l.time ? `${d} ${formatTime(l.time)}` : d)
    return l.student ? `${l.student} ${when}` : when
  }
  const reasonLabel = (r: string) => {
    const key = 'points.reason.' + r
    const v = t(key)
    return v === key ? r : v
  }

  return (
    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #c9d8ee', padding: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#56647d', marginBottom: '8px' }}>
        {t('points.card.title')}
      </div>
      {/* Purchased and bonus points are shown apart, never as one total: they
          follow different rules (bonus points expire, are spent first, and are
          not refundable), and a family should see which is which at a glance. */}
      {w.balanceGranted > 0 && (
        <div style={{ fontSize: '12px', color: '#56647d', marginBottom: '4px' }}>{t('points.card.purchasedLabel')}</div>
      )}
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: '36px', fontWeight: 900, color: GOLD, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {w.balancePurchased.toLocaleString()}
      </div>
      <div style={{ fontSize: '12px', color: '#56647d', marginTop: '4px', marginBottom: '14px' }}>
        {/* This line used to read "worth $1,985", which was the single
            strongest cue on the screen that the balance is MONEY PARKED HERE
            rather than lessons already bought. The rate is unchanged and still
            stated on the pricing page and in the FAQ -- it is just no longer
            the second thing a parent reads about their own account. */}
        {t(w.balanceGranted > 0 ? 'points.card.neverExpires' : 'points.card.worth')}
      </div>
      {/* Bonus points: their own box, with the date they stop working, said
          before it arrives so an expiry is never the first a family hears of it. */}
      {w.balanceGranted > 0 && (
        <div style={{ background: '#e6f4ee', border: '1px solid #b7e0cc', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1f7a57' }}>{t('points.card.grantedLabel')}</span>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: '22px', fontWeight: 900, color: '#1f7a57', fontVariantNumeric: 'tabular-nums' }}>
              {w.balanceGranted.toLocaleString()}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#56647d', marginTop: '6px', lineHeight: 1.5 }}>
            {w.grantedNextExpiry
              ? t('points.card.grantedNote', {
                  n: w.grantedNextExpiry.points.toLocaleString(),
                  date: fmtDate(new Date(w.grantedNextExpiry.date), locale === 'en' ? 'en-US' : locale === 'zh-Hans' ? 'zh-CN' : 'zh-TW', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }),
                })
              : t('points.card.grantedNoteNoDate')}
          </div>
        </div>
      )}

      {/* A bank return is rare and alarming, so it gets the top of the card and
          plain words: what is paused, how much, and the one button that fixes
          it. Nothing else on this screen changes -- their lessons and their
          history are all still theirs. */}
      {w.arrears > 0 && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c2bd', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#c0392b', marginBottom: '4px' }}>
            {t('points.card.arrearsTitle', { n: w.arrears.toLocaleString() })}
          </div>
          <div style={{ fontSize: '12px', color: '#56647d', lineHeight: 1.5, marginBottom: '10px' }}>
            {t('points.card.arrearsBody')}
          </div>
          <SettleArrearsButton owed={w.arrears}
            style={{ background: AMBER, color: NAVY, border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', minHeight: '40px' }} />
        </div>
      )}

      {/* From 我的 › 點數明細 the statement is the point: no lesson count, no
          buy button or Zelle (儲值 sits beside it on 我的), no toggle --
          the lines start right under the balance (2026-11-04). */}
      {!historyFirst && <>
      <div style={{ fontSize: '11px', color: '#56647d', marginBottom: '4px', lineHeight: 1.5 }}>
        {t('points.card.done', { n: w.lessonsCompleted })}
      </div>
      <div style={{ marginBottom: '14px' }} />

      <button onClick={onBuy}
        style={{ display: 'block', width: '100%', textAlign: 'center', padding: '9px 0', marginBottom: '12px', background: AMBER, color: NAVY, border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer' }}>
        {t('points.card.buy')}
      </button>
      {/* Zelle, folded under Buy (owner, 2026-10-21): only for a family with an
          assessed swimmer, as on the Points page. No amount step here -- the
          family types the amount into Zelle themselves. */}
      {zelle && <ZellePay style={{ marginTop: 0, marginBottom: 14 }} />}
      </>}

      <>
          {!historyFirst && <button onClick={toggleHistory} aria-expanded={showHistory}
            style={{ background: 'none', border: 'none', padding: '8px 0', minHeight: '40px', fontSize: '14px', fontWeight: 700, color: '#2050a0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px' }} aria-hidden="true">{showHistory ? '▲' : '▼'}</span>
            {t(showHistory ? 'points.card.hideHistory' : 'points.card.showHistory')}
          </button>}
          {showHistory && (
            <div
              /* Swipe to turn the page on a phone. Only a decisively SIDEWAYS
                 drag counts -- anything with a vertical component is the page
                 being scrolled, and stealing that would make the dashboard feel
                 broken. The buttons below stay visible on every screen size,
                 because a gesture nobody is told about is not a feature. */
              onTouchStart={(e) => { const p0 = e.touches[0]; swipeFrom.current = { x: p0.clientX, y: p0.clientY } }}
              onTouchEnd={(e) => {
                const from = swipeFrom.current
                swipeFrom.current = null
                if (!from) return
                const p1 = e.changedTouches[0]
                const dx = p1.clientX - from.x
                const dy = p1.clientY - from.y
                if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
                goPage(page + (dx < 0 ? 1 : -1))
              }}
              style={{ marginTop: '12px', borderTop: '1px solid #e3ebf6', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {history === null && !histFailed && (
                <div style={{ fontSize: '12px', color: '#56647d' }}>{t('common.loading')}</div>
              )}
              {histFailed && (
                <div style={{ fontSize: '12px', color: '#c0392b' }}>{t('err.generic')}</div>
              )}
              {history !== null && rows.length === 0 && (
                <div style={{ fontSize: '12px', color: '#56647d' }}>{t('points.card.noHistory')}</div>
              )}
              {pageRows.map(row => (
                <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: '#56647d' }}>{reasonLabel(row.reason)}</div>
                    <div style={{ fontSize: '12px', color: '#56647d', fontVariantNumeric: 'tabular-nums' }}>
                      {/* The school's day, as on the receipt (found 2026-10-15: an
                          evening top-up read as the next day outside Pacific time). */}
                      {fmtDate(new Date(row.at), intlOf(locale), { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })}
                      {row.lesson ? ' · ' + lessonText(row.lesson) : ''}
                      {row.note && noteText(row.note) ? ' · ' + noteText(row.note) : ''}
                    </div>
                    {/* The receipt for the money, on the line that spent it. */}
                    {row.invoice && (
                      <a href={`/api/invoices/${row.invoice.id}/pdf`} target="_blank" rel="noopener noreferrer"
                        title={t('points.card.receiptTitle', { number: row.invoice.number })}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '4px', padding: '6px 10px', minHeight: '36px', borderRadius: '8px', border: '1px solid #c9d8ee', fontSize: '13px', fontWeight: 700, color: GOLD, textDecoration: 'none' }}>
                        <span aria-hidden>🧾</span>{t('points.card.receipt')}
                      </a>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {row.kept != null ? (
                      // Nothing moved today: the points left with the booking.
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#c2621a' }}>
                        {t('points.card.kept', { n: row.kept.toLocaleString() })}
                      </div>
                    ) : row.payment ? (
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#16294a' }}>
                        ${((row.amountCents || 0) / 100).toFixed(2)}
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: row.points >= 0 ? '#1f7a57' : '#16294a' }}>
                          {row.points >= 0 ? '+' : '−'}{Math.abs(row.points).toLocaleString()}
                        </div>
                        <div style={{ fontSize: '12px', color: '#56647d' }}>{(row.balanceAfter ?? 0).toLocaleString()}</div>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {(pageCount > 1 || hasNext) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginTop: '6px' }}>
                  {/* Arrows and a counter rather than one chip per page: a year
                      of activity is dozens of pages, and that row would wrap
                      into a block taller than the ten rows above it. The count
                      reads "2 / 3+" while older lines are still to be fetched. */}
                  <button onClick={() => goPage(page - 1)} disabled={page === 0}
                    aria-label={t('points.card.prevPage')} className="tap-auto"
                    style={{ width: '30px', height: '30px', borderRadius: '6px', border: '1px solid #e3ebf6', background: 'transparent', color: page === 0 ? '#9aa6ba' : '#56647d', fontSize: '12px', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>←</button>
                  <span style={{ fontSize: '11px', color: '#56647d', fontVariantNumeric: 'tabular-nums' }}>
                    {histBusy && history !== null ? '…' : `${page + 1} / ${pageCount}${nextBefore ? '+' : ''}`}
                  </span>
                  <button onClick={() => goPage(page + 1)} disabled={!hasNext || histBusy}
                    aria-label={t('points.card.nextPage')} className="tap-auto"
                    style={{ width: '30px', height: '30px', borderRadius: '6px', border: '1px solid #e3ebf6', background: 'transparent', color: !hasNext ? '#9aa6ba' : '#56647d', fontSize: '12px', cursor: !hasNext ? 'not-allowed' : histBusy ? 'progress' : 'pointer' }}>→</button>
                </div>
              )}
            </div>
          )}
      </>
    </div>
  )
}

/**
 * Refer a friend: this family's code, a link to share, and who has used it.
 * Loaded when the sheet opens, not with the dashboard -- most visits never
 * open it. The referred families are shown by last name only (owner's call).
 */
export function ReferralCard({ focus }: { focus: boolean }) {
  const t = useT()
  const locale = useLocale()
  const [data, setData] = useState<{ code: string; link: string; points: number; mine?: { status: 'pending' | 'awarded'; referrer?: string } | null; referrals: { family: string; status: 'pending' | 'awarded' }[] } | null>(null)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/parent/referral').then(r => r.ok ? r.json() : null).then(j => { if (alive && j?.code) setData(j) }).catch(() => {})
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (focus && data) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focus, data])
  if (!data) return null

  // A phone gets the system share sheet (LINE, Messages, WhatsApp...); a
  // computer copies the link.
  const share = async () => {
    const text = t('ref.shareText', { n: data.points })
    if (typeof navigator !== 'undefined' && (navigator as any).share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await (navigator as any).share({ title: 'Manta Shark Aquatics', text, url: data.link }); return } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(data.link)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div ref={ref} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #b7e0cc', padding: '18px 20px', scrollMarginTop: '12px' }}>
      {/* A family that signed up through a friend sees its own reward here,
          waiting and then received, so the promise made at registration
          stays visible (owner, 2026-09-29). */}
      {data.mine && (
        <div style={{ background: '#effaf3', border: '1px solid #9fd8b8', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#14683f' }}>
            <span aria-hidden="true" style={{ marginRight: '6px' }}>{'\u{1F381}'}</span>{data.mine.status === 'awarded' ? t('ref.mine.awardedTitle', { n: data.points }) : t('ref.mine.pendingTitle')}
          </div>
          <div style={{ fontSize: '12.5px', color: '#2f5a44', lineHeight: 1.6, marginTop: '4px' }}>
            {data.mine.status === 'awarded'
              ? t('ref.mine.awardedBody', { name: data.mine.referrer || t('ref.mine.aFriend') })
              : t('ref.mine.pendingBody', { n: data.points, name: data.mine.referrer || t('ref.mine.aFriend') })}
          </div>
        </div>
      )}
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#16294a', marginBottom: '4px' }}>{t('ref.title', { n: data.points })}</div>
      <div style={{ fontSize: '12px', color: '#56647d', lineHeight: 1.6, marginBottom: '6px' }}>{t('ref.desc', { n: data.points })}</div>
      {/* The two rules that disappoint a family when nobody said them (owner,
          2026-10-02): the code only counts at sign-up, and the assessment is
          not the first lesson. The family reading this is the one who tells
          the friend. The rest is one tap away in the FAQ. */}
      <div style={{ fontSize: '11.5px', color: '#68768b', lineHeight: 1.6, marginBottom: '12px' }}>
        {t('ref.fine')}
        <a href={localePath('/faq', locale) + '#faq-q-referral'} style={{ marginLeft: '6px', color: '#2050a0', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>{t('ref.rules')} ›</a>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
        <span style={{ flex: 1, background: '#fff', border: '1px dashed #c9d8ee', borderRadius: '8px', padding: '9px 12px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '17px', fontWeight: 700, letterSpacing: '3px', color: GOLD, textAlign: 'center' }}>
          {data.code}
        </span>
        <button className="tap-auto" onClick={share}
          style={{ background: 'none', border: '1px solid #c9d8ee', color: GOLD, borderRadius: '8px', padding: '0 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {copied ? t('ref.copied') : t('ref.share')}
        </button>
      </div>
      {data.referrals.length > 0 && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {data.referrals.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12.5px', background: '#f6f9fd', borderRadius: '8px', padding: '8px 10px' }}>
              <span style={{ color: '#16294a' }}>{t('ref.family', { name: r.family })}</span>
              <span style={{ color: r.status === 'awarded' ? '#1f7a57' : '#56647d', fontWeight: r.status === 'awarded' ? 700 : 400 }}>
                {r.status === 'awarded' ? t('ref.awarded', { n: data.points }) : t('ref.pending')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
