import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { getT } from '@/lib/i18n/all'
import { ART, STRIP, buildCheckinPass, checkedPng, walletCheck } from '@/lib/wallet-pass'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* A swimmer's check-in QR as an Apple Wallet card (lib/wallet-pass.ts).
   GET ?ready=1 -> { ready, problem?, expires? } -- are the school's
       certificate and key set and good (the 報到 sheet shows 加入 Apple 錢包
       only then); never shows either.
   GET ?student=<id>&lang=<locale> -> the .pkpass with the swimmer the school
       drew (a browser's plain link).
   POST { student, art, strip } -> the .pkpass with the family's own
       swimmer, drawn on the phone (lib/wallet-art.ts; PNGs as base64, sizes
       checked). Bad pictures are left out, not refused.
   For a swimmer of this family (view-only members too: they bring the
   children as well). */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const check = walletCheck()
  if (q.get('ready')) return NextResponse.json(check)
  return make(q.get('student') || '', q.get('lang') || '', null)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { student?: unknown; lang?: unknown; art?: unknown; strip?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const art = checkedPng(body.art, ART.w, ART.h)
  const strip = checkedPng(body.strip, STRIP.w, STRIP.h)
  return make(String(body.student || ''), String(body.lang || ''), art && strip ? { art, strip } : null)
}

async function make(id: string, langIn: string, pics: { art: Buffer; strip: Buffer } | null) {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!walletCheck().ready) return NextResponse.json({ error: 'Not set up' }, { status: 503 })
  const { data: kid } = await auth.svc.from('students').select('id, full_name')
    .eq('id', id).eq('parent_id', auth.parent.id).maybeSingle()
  if (!kid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // The card is in English only (owner, 2026-11-17), whatever the family reads.
  void langIn
  const t = getT('en') as (k: string, v?: Record<string, string | number>) => string
  try {
    const file = buildCheckinPass({ id: kid.id, full_name: String(kid.full_name || '').trim() }, {
      card: t('wallet.pass.card'), student: t('wallet.pass.student'), school: t('wallet.pass.school'), how: t('wallet.pass.how'),
      help: t('wallet.pass.help'), description: t('wallet.pass.description'),
    }, pics)
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
