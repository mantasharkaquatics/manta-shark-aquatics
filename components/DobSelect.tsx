'use client'

/* The birthday as three selects -- month, day, year -- in the page's
   language, never in the future (school time). Shared by sign-up and adding
   a swimmer on the account page (14-role test 2, J108: that one was a native
   English mm/dd/yyyy box). */
import { useState } from 'react'
import { useLocale, useT } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'
import { getTodayLA } from '@/lib/date'

const DOB_MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']
// Month names in the page's language (found 2026-10-05: they were English on
// the Chinese pages). Intl gives "Jan" / "1月" from the same tag the rest of
// the site uses for dates; UTC so no time zone can shift the 1st into the
// previous month.
function monthName(mm: string, tag: string): string {
  return new Intl.DateTimeFormat(tag, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, Number(mm) - 1, 1)))
}

export default function DobSelect({ value, onChange, labelledBy }: { value: string; onChange: (v: string) => void; labelledBy?: string }) {
  const t = useT()
  const monthTag = dateTag(useLocale())
  const [vy = '', vm = '', vd = ''] = (value || '').split('-')
  const [y, setY] = useState(vy)
  const [m, setM] = useState(vm)
  const [d, setD] = useState(vd)
  // A birthday cannot be in the future: this year only offers the months so
  // far, and this month only the days so far (school's own time zone).
  const [ty, tm, td] = getTodayLA().split('-')
  const nowYear = Number(ty)
  const years: number[] = []
  for (let yr = nowYear; yr >= nowYear - 100; yr--) years.push(yr)
  const months = y === ty ? DOB_MONTHS.filter(mm => mm <= tm) : DOB_MONTHS
  const lastDay = (yy: string, mm: string) => {
    const n = yy && mm ? new Date(Number(yy), Number(mm), 0).getDate() : 31
    return yy === ty && mm === tm ? Math.min(n, Number(td)) : n
  }
  const daysInMonth = lastDay(y, m)
  const days: string[] = []
  for (let i = 1; i <= daysInMonth; i++) days.push(String(i).padStart(2, '0'))

  const emit = (ny: string, nm: string, nd: string) => {
    // Switching to this year can leave a month that has not happened yet.
    if (ny === ty && nm && nm > tm) nm = ''
    let fd = nd
    if (ny && nm && nd) fd = String(Math.min(Number(nd), lastDay(ny, nm))).padStart(2, '0')
    setY(ny); setM(nm); setD(fd)
    onChange(ny && nm && fd ? `${ny}-${nm}-${fd}` : '')
  }

  const selCls = "bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-2 py-2.5 text-sm"
  // One named group (found 2026-10-15): a screen reader heard only "Month",
  // "Day", "Year" for every child, with no word that it was a birthday,
  // whose, or that it was required.
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby={labelledBy}>
      <select value={m} onChange={e => emit(y, e.target.value, d)} className={selCls} aria-label={t('register.dob.month')} aria-required="true">
        <option value="">{t('register.dob.month')}</option>
        {months.map(mm => <option key={mm} value={mm}>{monthName(mm, monthTag)}</option>)}
      </select>
      <select value={d} onChange={e => emit(y, m, e.target.value)} className={selCls} aria-label={t('register.dob.day')} aria-required="true">
        <option value="">{t('register.dob.day')}</option>
        {days.map(dd => <option key={dd} value={dd}>{Number(dd)}</option>)}
      </select>
      <select value={y} onChange={e => emit(e.target.value, m, d)} className={selCls} aria-label={t('register.dob.year')} aria-required="true">
        <option value="">{t('register.dob.year')}</option>
        {years.map(yr => <option key={yr} value={String(yr)}>{yr}</option>)}
      </select>
    </div>
  )
}
