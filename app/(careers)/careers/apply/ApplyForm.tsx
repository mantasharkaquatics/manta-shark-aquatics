'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getTodayLA } from '@/lib/date'
import {
  PAGE, CARD, H1, SUB, LABEL, INPUT, FIELD,
  BUTTON, BUTTON_DISABLED, ERROR, LINK, FOOT, GOLD,
} from './ui'

const ROLES = [
  { value: 'swim_coach', label: 'Swim coach' },
  { value: 'front_desk', label: 'Front desk' },
  { value: 'lifeguard', label: 'Lifeguard' },
  { value: 'other', label: 'Something else' },
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Same limit as app/api/careers/apply (4 MB, under Vercel's 4.5 MB request cap).
const MAX_RESUME_BYTES = 4 * 1024 * 1024
const RESUME_EXT = /\.(pdf|docx?)$/i
const TOO_BIG = 'That file is too large. Please upload a PDF or Word file under 4 MB.'

const AREA = { ...INPUT, minHeight: '90px', resize: 'vertical' as const, fontFamily: 'inherit' }
const HINT = { fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: '6px 0 0' }
const CHECKROW = { display: 'flex', gap: '10px', alignItems: 'flex-start', margin: '0 0 12px' }
const OPT = { background: '#111d38' }

const FILE_BTN = {
  display: 'inline-block',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.22)',
  color: '#fff',
  borderRadius: '8px',
  padding: '10px 16px',
  fontSize: '14px',
  cursor: 'pointer',
}

export default function ApplyForm() {
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [done, setDone] = useState(false)
  // Already sent an application before (signed in again later, say): show
  // that, not a blank form that is refused only after it is filled in.
  const [alreadyApplied, setAlreadyApplied] = useState(false)
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement | null>(null)

  const [roleApplied, setRoleApplied] = useState('swim_coach')
  const [city, setCity] = useState('')
  const [is18, setIs18] = useState(false)
  const [workAuthorized, setWorkAuthorized] = useState(false)
  const [swimExperience, setSwimExperience] = useState('')
  const [certifications, setCertifications] = useState('')
  const [availability, setAvailability] = useState('')
  const [weeklyHours, setWeeklyHours] = useState('')
  const [startMonth, setStartMonth] = useState('')
  const [startDay, setStartDay] = useState('')
  const [startYear, setStartYear] = useState('')
  const [referralSource, setReferralSource] = useState('')
  const [message, setMessage] = useState('')
  const [resume, setResume] = useState<File | null>(null)
  const [resumeError, setResumeError] = useState('')

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  /* Start date menus (found 2026-10-08): the day list was always 1-31 and
     every month of this year was offered, so 2027-02-30 or a month already
     past could be sent. Now the days follow the chosen month and year (as
     the family DobSelect does) and nothing before today is offered, in the
     school's own time zone. */
  const [ty, tm, td] = getTodayLA().split('-').map(Number)
  const years = [ty, ty + 1]
  const monthOptions = MONTHS.map((m, i) => ({ m, n: i + 1 }))
    .filter(({ n }) => !(Number(startYear) === ty && n < tm))
  const lastDay = (y: string, m: string) => {
    if (!m) return 31
    // No year yet: allow Feb 29; choosing the year clamps it.
    return new Date(y ? Number(y) : 2028, Number(m), 0).getDate()
  }
  const firstDay = (y: string, m: string) => (Number(y) === ty && Number(m) === tm ? td : 1)
  const dayOptions: number[] = []
  for (let d = firstDay(startYear, startMonth); d <= lastDay(startYear, startMonth); d++) dayOptions.push(d)

  function setStart(y: string, m: string, d: string) {
    if (Number(y) === ty && m && Number(m) < tm) m = ''
    if (d && m && (Number(d) > lastDay(y, m) || Number(d) < firstDay(y, m))) d = ''
    setStartYear(y); setStartMonth(m); setStartDay(d)
  }

  useEffect(() => {
    fetch('/api/careers/me')
      .then((r) => r.json())
      .then((me) => {
        // Signed in but not verified yet: the verify page is the next step,
        // not a "Please sign in" that asks for the password again.
        if (me.signedIn && !me.fullyVerified) { router.replace('/careers/verify'); return }
        setSignedIn(Boolean(me.signedIn && me.fullyVerified))
        setAlreadyApplied(Boolean(me.hasApplied))
        setFirstName(me.firstName || '')
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [router])

  function pickResume(file: File | null) {
    setResumeError('')
    // Checked when the file is chosen, not after the whole form has uploaded
    // (found 2026-10-08).
    if (file && file.size > MAX_RESUME_BYTES) {
      setResume(null); setResumeError(TOO_BIG)
      if (fileInput.current) fileInput.current.value = ''
      return
    }
    if (file && !RESUME_EXT.test(file.name)) {
      setResume(null); setResumeError('Please choose a PDF or Word file (.pdf, .doc or .docx).')
      if (fileInput.current) fileInput.current.value = ''
      return
    }
    setResume(file)
  }

  function earliestStart(): string {
    if (!startMonth || !startDay || !startYear) return ''
    return `${startYear}-${startMonth.padStart(2, '0')}-${startDay.padStart(2, '0')}`
  }

  async function submit() {
    setError('')
    // Checked here as well as on the server so the applicant is told before a
    // round trip, and told next to the field rather than at the top.
    if (!resume) { setError('Please attach your résumé.'); return }
    // A half-filled date used to be dropped without a word.
    const parts = [startMonth, startDay, startYear].filter(Boolean).length
    if (parts > 0 && parts < 3) { setError('Please complete the start date, or leave all three boxes empty.'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.set('roleApplied', roleApplied)
      fd.set('city', city)
      fd.set('is18OrOver', String(is18))
      fd.set('workAuthorized', String(workAuthorized))
      fd.set('swimExperience', swimExperience)
      fd.set('certifications', certifications)
      fd.set('availability', availability)
      fd.set('weeklyHours', weeklyHours)
      fd.set('earliestStart', earliestStart())
      fd.set('referralSource', referralSource)
      fd.set('message', message)
      fd.set('resume', resume)

      const res = await fetch('/api/careers/apply', { method: 'POST', body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        // Vercel answers an oversized upload itself, with a 413 and no JSON.
        setError(res.status === 413 ? TOO_BIG : data?.error || 'Could not submit your application.')
        setBusy(false)
        return
      }
      setDone(true)
    } catch {
      setError('Could not reach the server. Please check your connection.')
      setBusy(false)
    }
  }

  const canSubmit = swimExperience.trim() !== '' && is18 && workAuthorized

  if (!ready) {
    return <main style={PAGE}><div style={CARD}><p style={SUB}>Loading…</p></div></main>
  }

  if (!signedIn) {
    return (
      <main style={PAGE}>
        <div style={CARD}>
          <h1 style={H1}>Please sign in</h1>
          <p style={SUB}>You need a verified account to fill out an application.</p>
          <p style={FOOT}><Link href="/careers/login" style={LINK}>Sign in</Link></p>
        </div>
      </main>
    )
  }

  if (alreadyApplied && !done) {
    return (
      <main style={PAGE}>
        <div style={CARD}>
          <h1 style={H1}>Application received</h1>
          <p style={SUB}>
            Thanks, {firstName}. You have already sent us your application, and we will be in
            touch by email or phone. If you need to change anything, contact us.
          </p>
          <p style={FOOT}><Link href="/careers" style={LINK}>Back to careers</Link></p>
        </div>
      </main>
    )
  }

  if (done) {
    return (
      <main style={PAGE}>
        <div style={CARD}>
          <h1 style={H1}>Application received</h1>
          <p style={SUB}>
            Thanks, {firstName}. We have your application and will be in touch by email or
            phone. If you do not hear from us within two weeks, feel free to follow up.
          </p>
          <p style={FOOT}><Link href="/careers" style={LINK}>Back to careers</Link></p>
        </div>
      </main>
    )
  }

  return (
    <main style={PAGE}>
      <div style={{ ...CARD, maxWidth: '620px' }}>
        <h1 style={H1}>Your application</h1>
        <p style={SUB}>
          Hi {firstName} — we already have your name, email and phone. Just a few more things.
        </p>

        {error ? <div style={ERROR}>{error}</div> : null}

        <div style={FIELD}>
          <label style={LABEL} htmlFor="role">Position you are applying for</label>
          <select id="role" style={INPUT} value={roleApplied}
            onChange={(e) => setRoleApplied(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value} style={OPT}>{r.label}</option>
            ))}
          </select>
        </div>

        <div style={FIELD}>
          <label style={LABEL} htmlFor="city">City you live in</label>
          <input id="city" style={INPUT} value={city}
            onChange={(e) => setCity(e.target.value)} />
        </div>

        <div style={{ margin: '24px 0 20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={CHECKROW}>
            <input type="checkbox" id="is18" checked={is18} style={{ marginTop: '4px' }}
              onChange={(e) => setIs18(e.target.checked)} />
            <label htmlFor="is18" style={{ fontSize: '15px', lineHeight: 1.5 }}>
              I am 18 years of age or older
            </label>
          </div>
          <div style={CHECKROW}>
            <input type="checkbox" id="auth" checked={workAuthorized} style={{ marginTop: '4px' }}
              onChange={(e) => setWorkAuthorized(e.target.checked)} />
            <label htmlFor="auth" style={{ fontSize: '15px', lineHeight: 1.5 }}>
              I am legally authorized to work in the United States
            </label>
          </div>
        </div>

        <div style={FIELD}>
          <label style={LABEL} htmlFor="swim">Your swimming experience</label>
          <textarea id="swim" style={AREA} value={swimExperience}
            onChange={(e) => setSwimExperience(e.target.value)} />
          <p style={HINT}>
            Competitive swimming, water polo, lifeguarding, teaching — whatever you have done in
            the water. Required.
          </p>
        </div>

        <div style={FIELD}>
          <label style={LABEL} htmlFor="certs">Certifications</label>
          <textarea id="certs" style={AREA} value={certifications}
            onChange={(e) => setCertifications(e.target.value)} />
          <p style={HINT}>Optional — we train and can help you get certified.</p>
        </div>

        <div style={FIELD}>
          <label style={LABEL} htmlFor="avail">When can you work?</label>
          <textarea id="avail" style={AREA} value={availability}
            onChange={(e) => setAvailability(e.target.value)} />
          <p style={HINT}>Days and times that work for you.</p>
        </div>

        <div style={FIELD}>
          <label style={LABEL} htmlFor="hours">Hours per week</label>
          <input id="hours" style={INPUT} value={weeklyHours} placeholder="e.g. 15-20"
            onChange={(e) => setWeeklyHours(e.target.value)} />
        </div>

        <div style={FIELD}>
          <label style={LABEL}>Earliest start date</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select style={{ ...INPUT, flex: 2 }} value={startMonth} aria-label="Start month"
              onChange={(e) => setStart(startYear, e.target.value, startDay)}>
              <option value="" style={OPT}>Month</option>
              {monthOptions.map(({ m, n }) => (
                <option key={m} value={String(n)} style={OPT}>{m}</option>
              ))}
            </select>
            <select style={{ ...INPUT, flex: 1 }} value={startDay} aria-label="Start day"
              onChange={(e) => setStart(startYear, startMonth, e.target.value)}>
              <option value="" style={OPT}>Day</option>
              {dayOptions.map((d) => (
                <option key={d} value={String(d)} style={OPT}>{d}</option>
              ))}
            </select>
            <select style={{ ...INPUT, flex: 1 }} value={startYear} aria-label="Start year"
              onChange={(e) => setStart(e.target.value, startMonth, startDay)}>
              <option value="" style={OPT}>Year</option>
              {years.map((y) => (
                <option key={y} value={String(y)} style={OPT}>{y}</option>
              ))}
            </select>
          </div>
          <p style={HINT}>Optional.</p>
        </div>

        <div style={FIELD}>
          <label style={LABEL} htmlFor="resume">Résumé <span style={{ color: '#e05a4a' }}>*</span></label>
          {/* A real button, so the required résumé can be attached from the
              keyboard (found 2026-10-08): the old <label> styled as a button
              was not in the Tab order, and the file input behind it is hidden
              so the browser's own control cannot show its non-English text. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button type="button" id="resume" style={FILE_BTN} aria-describedby="resume-name"
              onClick={() => fileInput.current?.click()}>Choose file</button>
            <span id="resume-name" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
              {resume ? resume.name : 'No file chosen'}
            </span>
          </div>
          <input ref={fileInput} type="file" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true"
            accept=".pdf,.doc,.docx"
            onChange={(e) => pickResume(e.target.files?.[0] || null)} />
          {resumeError ? <p role="alert" style={{ ...HINT, color: '#ffb4b4' }}>{resumeError}</p> : null}
          <p style={HINT}>Required. PDF or Word, up to 4 MB.</p>
        </div>

        <div style={FIELD}>
          <label style={LABEL} htmlFor="referral">How did you hear about us?</label>
          <input id="referral" style={INPUT} value={referralSource}
            onChange={(e) => setReferralSource(e.target.value)} />
        </div>

        <div style={FIELD}>
          <label style={LABEL} htmlFor="msg">Anything else you want us to know?</label>
          <textarea id="msg" style={AREA} value={message}
            onChange={(e) => setMessage(e.target.value)} />
        </div>

        <button
          style={busy || !canSubmit ? BUTTON_DISABLED : BUTTON}
          disabled={busy || !canSubmit}
          onClick={submit}
        >
          {busy ? 'Submitting…' : 'Submit application'}
        </button>

        <p style={{ ...HINT, textAlign: 'center', marginTop: '14px' }}>
          You can only submit once. Contact us if you need to change anything afterwards.
        </p>
      </div>
    </main>
  )
}
