/* One way to write a date across the site (owner, 2026-11-04, 問題 9 選項 A):
   a full date is 11月5日（四） in Chinese and Thu, Nov 5 in English; many dates
   side by side (numeric month) are 11/5（四） or 11/5. Every page's
   `x.toLocaleDateString(tag, options)` goes through fmtDate instead (same
   arguments), which keeps what the options ask for -- year or not, weekday or
   not, the time zone -- and only writes it the one way. Without a weekday,
   or for anything else (a month and year, a weekday alone), the browser's own
   wording is kept. */

type Tag = string | string[] | undefined

const isZh = (tag: Tag) => String(Array.isArray(tag) ? tag[0] : tag || '').toLowerCase().startsWith('zh')

export function fmtDate(d: Date, tag?: Tag, o: Intl.DateTimeFormatOptions = {}): string {
  const hasW = !!o.weekday, hasM = !!o.month, hasD = !!o.day
  if (!(hasW && hasM && hasD) || o.hour || o.minute) return d.toLocaleDateString(tag, o)
  const tz = o.timeZone ? { timeZone: o.timeZone } : {}
  if (isZh(tag)) {
    const part = (k: Intl.DateTimeFormatPartTypes, opt: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-US', { ...opt, ...tz }).formatToParts(d).find(p => p.type === k)?.value || ''
    const y = o.year ? part('year', { year: 'numeric' }) : ''
    const m = part('month', { month: 'numeric' }), day = part('day', { day: 'numeric' })
    const w = new Intl.DateTimeFormat(Array.isArray(tag) ? tag[0] : tag, { weekday: 'narrow', ...tz }).format(d)
    const date = o.month === 'numeric' || o.month === '2-digit'
      ? `${y ? y + '/' : ''}${m}/${day}`
      : `${y ? y + '年' : ''}${m}月${day}日`
    return `${date}（${w}）`
  }
  // English (and anything else): the short weekday and month, as on a calendar.
  const month = o.month === 'numeric' || o.month === '2-digit' ? 'numeric' : 'short'
  return d.toLocaleDateString(tag, { ...tz, weekday: 'short', month, day: 'numeric', ...(o.year ? { year: 'numeric' } : {}) })
}
