import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { centsToPoints } from '@/lib/points'
import { applyPoints, DuplicateLedgerEntry } from '@/lib/points-wallet'

// Finishes a desk sale whose points did not all go in.
//
// complete-sale and complete-sdp-sale record the purchase first and credit the
// wallet second, as two movements: the purchased points, then any bonus. When
// either movement fails the desk gets a button that lands here with the
// purchase id. The only other tool, the manual adjustment on the parent's
// page, writes every addition as GRANTED points -- which expire in a year,
// cannot be refunded and drop out of the refundable balance -- so paid points
// re-added there stopped being paid points (found 2026-10-05).
//
// Each movement is done at most once per purchase. Both carry the purchase id
// in `pricing`, which is what this route looks for before writing; a card sale
// is also matched on its payment intent. docs/migration-pos-credit-retry.sql
// adds a unique index so two presses racing each other cannot both write.

const MAX_BONUS = 20_000

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc, admin } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const purchaseId = String(body?.purchaseId || '')
    const bonus = Math.round(Number(body?.bonusPoints || 0))
    const bonusNote = String(body?.bonusNote || '').trim().slice(0, 300)
    if (!purchaseId) return NextResponse.json({ error: 'purchaseId required' }, { status: 400 })
    if (!Number.isFinite(bonus) || bonus < 0 || bonus > MAX_BONUS)
      return NextResponse.json({ error: 'Invalid bonus points' }, { status: 400 })
    if (bonus > 0 && !bonusNote) return NextResponse.json({ error: 'A bonus needs its note' }, { status: 400 })

    const { data: p } = await svc.from('purchases').select('*').eq('id', purchaseId).maybeSingle()
    if (!p) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })
    // Only a desk points sale: paid, entered by a person, not a package, not
    // since reversed or refunded.
    if (p.status !== 'paid' || !p.recorded_by || p.lesson_package_id || p.reversed_at || Number(p.refunded_cents || 0) > 0)
      return NextResponse.json({ error: 'This purchase cannot have points added this way.' }, { status: 400 })
    // A desk Swim Assessment is a purchase too; its credit is a lesson credit,
    // not points.
    const { data: credit } = await svc.from('lesson_credits').select('id').eq('purchase_id', p.id).limit(1)
    if (credit && credit.length)
      return NextResponse.json({ error: 'This purchase is a Swim Assessment, not points.' }, { status: 400 })

    const points = centsToPoints(Number(p.amount_cents) || 0)
    if (points <= 0) return NextResponse.json({ error: 'This purchase has no points to add.' }, { status: 400 })
    const pi: string | null = p.stripe_payment_intent_id || null
    const actor = `admin:${admin.id}`

    // --- The purchased points ---
    const { data: byId, error: e1 } = await svc.from('point_ledger').select('id')
      .eq('parent_id', p.parent_id).eq('reason', 'purchase')
      .contains('pricing', { purchaseId: p.id }).limit(1)
    if (e1) throw new Error(`ledger not read: ${e1.message}`)
    let credited = !!(byId && byId.length)
    if (!credited && pi) {
      const { data: byPi, error: e2 } = await svc.from('point_ledger').select('id')
        .eq('stripe_session_id', pi).eq('reason', 'purchase').limit(1)
      if (e2) throw new Error(`ledger not read: ${e2.message}`)
      credited = !!(byPi && byPi.length)
    }
    if (!credited && !pi) {
      // A cash sale from before the purchase id was written on the ledger
      // has nothing to key on. A purchase line for the same family and amount
      // within the hour after it is taken as that sale's credit: adding the
      // points twice is the worse mistake.
      const from = new Date(p.created_at || p.paid_at)
      const until = new Date(from.getTime() + 60 * 60 * 1000)
      const { data: near, error: e3 } = await svc.from('point_ledger').select('id')
        .eq('parent_id', p.parent_id).eq('reason', 'purchase').eq('amount_cents', p.amount_cents)
        .is('pricing', null)
        .gte('created_at', from.toISOString()).lte('created_at', until.toISOString()).limit(1)
      if (e3) throw new Error(`ledger not read: ${e3.message}`)
      credited = !!(near && near.length)
    }

    let added = 0
    if (!credited) {
      try {
        await applyPoints(svc, {
          parentId: p.parent_id, reason: 'purchase', points,
          amountCents: Number(p.amount_cents),
          stripeSessionId: pi,
          pricing: { kind: 'pos_purchase', purchaseId: p.id },
          actor,
        })
        added += points
      } catch (e) {
        if (!(e instanceof DuplicateLedgerEntry)) throw e
      }
    }

    // --- The bonus, only once the purchase is in ---
    let bonusAdded = 0
    if (bonus > 0) {
      const { data: had, error: e4 } = await svc.from('point_ledger').select('id')
        .eq('parent_id', p.parent_id).eq('reason', 'admin_grant')
        .contains('pricing', { kind: 'pos_bonus', purchaseId: p.id }).limit(1)
      if (e4) throw new Error(`ledger not read: ${e4.message}`)
      if (!had || had.length === 0) {
        try {
          await applyPoints(svc, {
            parentId: p.parent_id, reason: 'admin_grant', points: bonus, toGranted: true,
            pricing: { kind: 'pos_bonus', purchaseId: p.id },
            actor, note: bonusNote,
          })
          bonusAdded = bonus
        } catch (e) {
          if (!(e instanceof DuplicateLedgerEntry)) throw e
        }
      }
    }

    console.log(`✅ POS retry-credit: purchase=${p.id} parent=${p.parent_id} purchased+${added} bonus+${bonusAdded}`)
    return NextResponse.json({ success: true, purchaseId: p.id, added, bonusAdded })
  } catch (err: any) {
    console.error('POS retry-credit error:', err)
    return NextResponse.json({
      error: 'The points still did not go in. Nothing was charged again — wait a minute and press the button again.',
    }, { status: 500 })
  }
}
