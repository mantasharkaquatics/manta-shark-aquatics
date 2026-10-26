import { createHash } from 'crypto'
import { AsyncLocalStorage } from 'async_hooks'
import { serviceClient } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { ALERT_EMAIL_FALLBACK } from '@/lib/site-config'

/* Error alerts (owner, 2026-10-26: "the site emails me itself", no Sentry,
   email only). Three ways in, one way out:

     - instrumentation.ts onRequestError: anything a page or route throws
       that nobody caught;
     - instrumentation.ts register(): console.error on the server. Most of
       our routes catch their own errors, log them with console.error and
       answer 500 -- onRequestError never sees those, so the log line is the
       signal (422 of them across the code on 2026-10-26);
     - /api/client-error: errors in a family's browser.

   Each error is grouped by a signature (where it came from + the message
   with ids and numbers taken out) in error_events
   (docs/migration-error-alerts.sql). The first one emails the school at
   once; the same error again within the hour only counts. Over 20 alert
   emails in an hour (an outage that breaks everything at once) and over 5
   from browsers (anyone can post to that endpoint) wait for the daily
   summary instead, which goes out with the 9:00 run (sendErrorDigest).

   Production only: a preview or a laptop would mail the school about its
   own experiments. If the table is missing or the database itself is down
   -- exactly when you want to hear -- each server instance still mails, at
   most once per signature per hour and five times an hour in all. */

export type ErrorSource = 'server' | 'log' | 'browser' | 'cron'

const inReport = new AsyncLocalStorage<boolean>()
/** console.error as it was before register() wrapped it. */
let rawError: (...a: unknown[]) => void = console.error.bind(console)
export function setRawConsoleError(fn: (...a: unknown[]) => void) { rawError = fn }

export const reportingOn = () =>
  process.env.VERCEL_ENV === 'production' || process.env.ERROR_ALERTS_FORCE === '1'

export const insideReport = () => inReport.getStore() === true

/* An uncaught error reaches both onRequestError and Next's own console.error
   of it. Whichever sees the Error object first reports it; the other skips. */
const claimed = new WeakSet<object>()
export function claimError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return true
  if (claimed.has(e)) return false
  claimed.add(e)
  return true
}

const LA = (d: Date) => d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' })

/** Ids, numbers, emails and quoted values out, so "booking 81f2... failed"
    and "booking 9c0a... failed" are one error, not two. */
export function normalizeMessage(m: string): string {
  return m
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\b(pi|cs|ch|cus|sub|in|re|evt|we|du|seti|pm)_[A-Za-z0-9]+/g, '<stripe>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

/** One readable line for anything that was passed to console.error. */
export function describe(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    // Supabase / Postgres errors: { message, code, details, hint }
    if (typeof o.message === 'string') return [o.code, o.message, o.details, o.hint].filter(Boolean).join(' · ')
    try { return JSON.stringify(v).slice(0, 600) } catch { return String(v) }
  }
  return String(v)
}

/** The first frame of ours in a stack: "app/api/stripe/webhook/route" rather
    than a node_modules frame. Built files keep the route's path. */
export function whereFrom(stack: string | undefined): string {
  if (!stack) return ''
  for (const line of stack.split('\n').slice(1)) {
    if (line.includes('node_modules') || line.includes('error-report')) continue
    const m = line.match(/(?:server\/(?:app|chunks)\/|\/(?:app|lib|components)\/)([^\s):]+)/)
    if (m) return m[0].replace(/^.*?server\//, '').replace(/\.js$/, '').slice(0, 120)
  }
  return ''
}

type Report = {
  source: ErrorSource
  message: string
  /** Where: a route path, a file, a page URL. Part of the signature. */
  where?: string
  /** Anything else worth reading in the email (stack, request, args). */
  detail?: string
  /** Hours before the same error mails again (default 1). */
  everyHours?: number
}

// The fallback when error_events cannot be used: per server instance.
const localSeen = new Map<string, number>()
const localSent: number[] = []

async function mail(title: string, lines: string[]) {
  return sendEmail({
    type: 'admin_alert',
    to: process.env.ADMIN_ALERT_EMAIL || ALERT_EMAIL_FALLBACK,
    alertTitle: title,
    alertLines: lines,
  })
}

/** Record an error and, when it is new or an hour has passed, email the
    school. Never throws; never reports itself. */
export async function reportError(r: Report): Promise<void> {
  if (!reportingOn() || insideReport()) return
  await inReport.run(true, async () => {
    try {
      const norm = normalizeMessage(r.message)
      const where = (r.where || '').slice(0, 200)
      const sig = createHash('sha1').update(`${r.source}|${where}|${norm}`).digest('hex').slice(0, 32)
      const detail = (r.detail || '').slice(0, 4000)

      let alert = false
      let since = 1
      let firstSeen: string | null = null
      try {
        const { data, error } = await serviceClient().rpc('error_event_hit', {
          p_sig: sig, p_source: r.source, p_message: r.message.slice(0, 500), p_where: where,
          p_detail: detail, p_every_minutes: Math.round((r.everyHours ?? 1) * 60),
        })
        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        alert = !!row?.should_alert
        since = Number(row?.since_alert) || 1
        firstSeen = row?.first_seen || null
      } catch (e) {
        // Table missing or the database down: decide here instead.
        const now = Date.now()
        while (localSent.length && localSent[0] < now - 3600_000) localSent.shift()
        const last = localSeen.get(sig) || 0
        alert = now - last > (r.everyHours ?? 1) * 3600_000 && localSent.length < 5
        if (alert) { localSeen.set(sig, now); localSent.push(now) }
        rawError('[error-report] error_events unavailable:', describe(e))
      }
      if (!alert) return

      const label = { server: 'Server error', log: 'Server error', browser: 'Error in a family\'s browser', cron: 'Scheduled job' }[r.source]
      const lines = [
        `What: ${r.message.slice(0, 500)}`,
        where ? `Where: ${where}` : '',
        `When: ${LA(new Date())} (Los Angeles)`,
        since > 1 ? `Times since the last email about it: ${since}` : 'First time this hour.',
        firstSeen ? `First seen: ${LA(new Date(firstSeen))}` : '',
        detail ? `Detail: ${detail.slice(0, 1500)}` : '',
        'The same error emails again at most once an hour; everything is also in the 9:00 daily summary.',
      ].filter(Boolean)
      const ok = await mail(`${label}: ${r.message.slice(0, 80)}`, lines)
      if (!ok) rawError('[error-report] alert email not sent:', r.message)
    } catch (e) {
      rawError('[error-report] failed:', describe(e))
    }
  })
}

/** Schedule a report without holding up the caller. Inside a request,
    next/server after() keeps the function alive until it is sent. */
export function reportSoon(r: Report): void {
  if (!reportingOn() || insideReport()) return
  const run = () => reportError(r)
  import('next/server')
    .then(({ after }) => { try { after(run) } catch { void run() } })
    .catch(() => { void run() })
}

/* ---------- scheduled jobs: when each last ran ---------- */

/** How long each job may go quiet before it counts as not running. Paths
    are /api/cron/<name>; schedules are set on cron-job.org. */
export const CRON_EXPECT: Record<string, { label: string; maxQuietMin: number }> = {
  'cleanup-pending-bookings': { label: 'Unpaid booking clean-up (every 15 min)', maxQuietMin: 60 },
  'sms-reminder': { label: 'Lesson reminders (every 30 min)', maxQuietMin: 120 },
  'chat-reply-email': { label: 'Chat reply emails (every 5 min)', maxQuietMin: 60 },
  'zelle-sync': { label: 'Zelle email check (every 5 min)', maxQuietMin: 60 },
  'monthly-reports': { label: 'Monthly reports (hourly)', maxQuietMin: 180 },
  'daily-points': { label: 'Daily points (daily)', maxQuietMin: 26 * 60 },
  'low-balance': { label: 'Low balance + follow-ups + this summary (daily 9:00)', maxQuietMin: 26 * 60 },
  'birthday-cards': { label: 'Birthday cards (daily 8:00)', maxQuietMin: 26 * 60 },
}

/** Called by requireCron for every authorised run. */
export function recordCronRun(path: string): void {
  if (!reportingOn()) return
  const name = path.split('/').filter(Boolean).pop() || path
  const run = async () => {
    try {
      const svc = serviceClient()
      await svc.from('cron_runs').upsert({ name, last_run_at: new Date().toISOString() })
      // Any job's run also checks the others (one read), so a job that
      // stopped is noticed within minutes, mailed once every 12 hours.
      const { data } = await svc.from('cron_runs').select('name, last_run_at')
      for (const row of data || []) {
        const want = CRON_EXPECT[row.name]
        if (!want) continue
        const quiet = (Date.now() - new Date(row.last_run_at).getTime()) / 60000
        if (quiet > want.maxQuietMin) {
          await reportError({
            source: 'cron', everyHours: 12, where: `/api/cron/${row.name}`,
            message: `${want.label} has not run for ${Math.round(quiet / 60)} hours`,
            detail: `Last run ${LA(new Date(row.last_run_at))}. Check the job on cron-job.org.`,
          })
        }
      }
    } catch { /* the table may not exist yet */ }
  }
  import('next/server')
    .then(({ after }) => { try { after(run) } catch { void run() } })
    .catch(() => { void run() })
}

/* ---------- the daily summary ---------- */

/** The last 24 hours of errors and every job's last run, mailed with the
    9:00 run. Sends nothing when there were no errors and every job ran. */
export async function sendErrorDigest(): Promise<{ sent: boolean; errors: number; quietJobs: number }> {
  if (!reportingOn()) return { sent: false, errors: 0, quietJobs: 0 }
  const svc = serviceClient()
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const [{ data: errs }, { data: runs }] = await Promise.all([
    svc.from('error_events').select('source, message, where_from, count, last_seen')
      .gte('last_seen', since).order('last_seen', { ascending: false }).limit(40),
    svc.from('cron_runs').select('name, last_run_at'),
  ])
  const seen = new Map((runs || []).map(r => [r.name as string, r.last_run_at as string]))
  const quiet = Object.entries(CRON_EXPECT).filter(([name, w]) => {
    const t = seen.get(name)
    return !t || (Date.now() - new Date(t).getTime()) / 60000 > w.maxQuietMin
  })
  const list = errs || []
  if (list.length === 0 && quiet.length === 0) return { sent: false, errors: 0, quietJobs: 0 }

  const lines: string[] = []
  if (list.length) {
    lines.push(`${list.length} different error${list.length === 1 ? '' : 's'} in the last 24 hours:`)
    for (const e of list) {
      lines.push(`• ${e.message}${e.where_from ? ` — ${e.where_from}` : ''} (${e.source}; ${e.count}× since first seen; last ${LA(new Date(e.last_seen))})`)
    }
  } else {
    lines.push('No errors in the last 24 hours.')
  }
  if (quiet.length) {
    lines.push('Scheduled jobs that have not run when they should:')
    for (const [name, w] of quiet) {
      const t = seen.get(name)
      lines.push(`• ${w.label} — ${t ? `last ran ${LA(new Date(t))}` : 'no run recorded yet'}`)
    }
  }
  const ok = await mail('Daily error summary', lines)
  return { sent: ok, errors: list.length, quietJobs: quiet.length }
}
