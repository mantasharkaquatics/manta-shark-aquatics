import { createClient } from '@supabase/supabase-js'
import { getT, toLocale } from '@/lib/i18n/all'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Unsubscribe | Manta Shark Aquatics', robots: { index: false, follow: false } }

/* The page behind the unsubscribe link in marketing email (lib/unsubscribe.ts).
   One button, no login. In the family's own language, read from their account,
   because they arrive from an email and the site may not know them yet. */

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const p = sp.p || ''
  const tok = sp.t || ''
  const valid = verifyUnsubscribeToken(p, tok)

  let lang = toLocale(undefined)
  let subscribed: boolean | null = null
  if (valid) {
    const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await svc.from('parents').select('preferred_language, newsletter_subscribed').eq('id', p).maybeSingle()
    if (data) { lang = toLocale(data.preferred_language); subscribed = !!data.newsletter_subscribed }
  }
  const t = getT(lang)

  const done = sp.done === '1' || (valid && subscribed === false)
  const title = !valid ? t('unsub.badTitle') : done ? t('unsub.doneTitle') : t('unsub.title')
  const body = !valid ? t('unsub.badBody') : done ? t('unsub.doneBody') : t('unsub.body')

  return (
    // A <div>: the layout's <main> already holds this page (found 2026-10-15).
    <div lang={lang} className="min-h-dvh px-4 pt-32 pb-20 bg-[#f4f7fc]">
      <div className="mx-auto max-w-lg rounded-2xl border border-[#d5e0ef] bg-white p-8 text-[#16294a]">
        <h1 className="text-2xl font-bold text-[#12254a]" style={{ textWrap: 'balance' }}>{title}</h1>
        <p className="mt-3 leading-relaxed">{body}</p>
        {sp.error === '1' && valid && <p role="alert" className="mt-3 text-red-600 text-sm">{t('unsub.error')}</p>}
        {valid && !done && (
          <form method="post" action="/api/unsubscribe" className="mt-6">
            <input type="hidden" name="p" value={p} />
            <input type="hidden" name="t" value={tok} />
            <button type="submit" className="rounded-xl bg-[#12254a] px-6 py-3 font-semibold text-white hover:bg-[#1c3566]">
              {t('unsub.button')}
            </button>
          </form>
        )}
        {done && <p className="mt-4 text-sm text-[#56647d]">{t('unsub.resubscribe')}</p>}
      </div>
    </div>
  )
}
