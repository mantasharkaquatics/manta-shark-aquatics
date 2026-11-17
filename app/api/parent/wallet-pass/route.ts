import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { getT } from '@/lib/i18n/all'
import { LOCALES, type Locale } from '@/lib/i18n'
import { buildCheckinPass, walletCheck } from '@/lib/wallet-pass'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* A swimmer's check-in QR as an Apple Wallet card (lib/wallet-pass.ts).
   GET ?ready=1 -> { ready, problem?, expires? } -- are the school's
       certificate and key set and good (the 報到 sheet shows 加入 Apple 錢包
       only then); never shows either.
   GET ?student=<id>&lang=<locale> -> the .pkpass, for a swimmer of this
       family (view-only members too: they bring the children as well). */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const check = walletCheck()
  if (q.get('ready')) return NextResponse.json(check)
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!check.ready) return NextResponse.json({ error: 'Not set up' }, { status: 503 })
  const id = q.get('student') || ''
  const { data: kid } = await auth.svc.from('students').select('id, full_name')
    .eq('id', id).eq('parent_id', auth.parent.id).maybeSingle()
  if (!kid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const lang = (LOCALES as readonly string[]).includes(q.get('lang') || '') ? q.get('lang') as Locale : 'en'
  const t = getT(lang) as (k: string, v?: Record<string, string | number>) => string
  try {
    const file = buildCheckinPass({ id: kid.id, full_name: String(kid.full_name || '').trim() }, {
      student: t('wallet.pass.student'), school: t('wallet.pass.school'), how: t('wallet.pass.how'),
      help: t('wallet.pass.help'), description: t('wallet.pass.description'),
    })
    return new NextResponse(new Uint8Array(file), { headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': 'attachment; filename="manta-shark-checkin.pkpass"',
      'Cache-Control': 'no-store',
    } })
  } catch (e) {
    console.error('[wallet-pass]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not make the card' }, { status: 500 })
  }
}
