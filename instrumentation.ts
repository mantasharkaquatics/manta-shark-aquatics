/* Error alerts (owner, 2026-10-26): lib/error-report.ts.

   register() wraps console.error on the server, because most of our routes
   catch their own errors, log them and answer 500 -- the log line is the only
   sign. onRequestError hears whatever nobody caught. Both only in
   production (reportingOn), and only on the Node runtime, where the report
   code (crypto, async_hooks) runs. The imports sit inside
   `if (process.env.NEXT_RUNTIME === 'nodejs')` so the edge build drops them. */
import type { Instrumentation } from 'next'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const er = await import('./lib/error-report')
    if (!er.reportingOn()) return
    const original = console.error.bind(console)
    er.setRawConsoleError(original)
    console.error = (...args: unknown[]) => {
      original(...args)
      if (er.insideReport() || args.length === 0) return
      try {
        const text = args.map(er.describe).join(' ').replace(/^⨯\s*/, '').trim()
        if (!text) return
        const err = args.find((a): a is Error => a instanceof Error)
        if (err && !er.claimError(err)) return
        const where = er.whereFrom(err?.stack) || er.whereFrom(new Error().stack)
        er.reportSoon({ source: 'log', message: text.slice(0, 500), where, detail: err?.stack?.slice(0, 2000) })
      } catch { /* never let logging break the request */ }
    }
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const er = await import('./lib/error-report')
    if (!er.claimError(err)) return
    const e = err as { message?: string; digest?: string; stack?: string }
    await er.reportError({
      source: 'server',
      message: (e?.message || String(err)).slice(0, 500),
      where: context.routePath,
      detail: [
        `${request.method} ${request.path.split('?')[0]}`,
        `${context.routeType}${context.renderSource ? ' / ' + context.renderSource : ''}`,
        e?.digest ? `digest ${e.digest}` : '',
        e?.stack?.slice(0, 2000) || '',
      ].filter(Boolean).join('\n'),
    })
  }
}
