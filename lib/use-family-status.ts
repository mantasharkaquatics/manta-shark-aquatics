'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { myParentId } from '@/lib/my-parent'

export type FamilyStatus = {
  /** null until the browser has looked; then whether anyone is signed in. */
  signedIn: boolean | null
  /** A signed-in family with at least one active swimmer, every one of them
   *  with a level: the assessment is behind them. False while unknown. */
  allAssessed: boolean
  /** At least one active swimmer has a level: what opens buying points
   *  (owner, 2026-10-13), and so what shows the Zelle details (2026-10-21). */
  anyAssessed: boolean
  /** The active swimmers still to be assessed (id and name). Empty while unknown. */
  toAssess?: { id: string; name: string }[]
}

/**
 * What a marketing page's call-to-action should offer this visitor. Signed
 * out: create an account / book the assessment. Signed in: their account, or
 * booking once every swimmer has a level. Read after paint and for display
 * only -- the pages render the signed-out version first.
 *
 * getSession reads the stored session without a network round trip; the
 * parents/students read only happens for a signed-in visitor.
 */
export function useFamilyStatus(): FamilyStatus {
  const [status, setStatus] = useState<FamilyStatus>({ signedIn: null, allAssessed: false, anyAssessed: false })
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!live) return
        if (!session) { setStatus({ signedIn: false, allAssessed: false, anyAssessed: false }); return }
        setStatus({ signedIn: true, allAssessed: false, anyAssessed: false })
        const familyId = await myParentId(supabase, session.user.id)
        if (!familyId) return
        const p = { id: familyId }
        const { data: kids } = await supabase.from('students').select('id, full_name, current_level').eq('parent_id', p.id).eq('is_active', true)
        type K = { id: string; full_name: string; current_level: number | null }
        const levelled = (kids || []).filter((k: K) => k.current_level != null).length
        const toAssess = (kids || []).filter((k: K) => k.current_level == null).map((k: K) => ({ id: k.id, name: k.full_name }))
        if (live && kids) {
          setStatus({ signedIn: true, allAssessed: kids.length > 0 && levelled === kids.length, anyAssessed: levelled > 0, toAssess })
        }
      } catch {
        if (live) setStatus(s => s.signedIn === null ? { signedIn: false, allAssessed: false, anyAssessed: false } : s)
      }
    })()
    return () => { live = false }
  }, [])
  return status
}

/** For a click that lands before useFamilyStatus has answered. */
export async function isSignedInNow(): Promise<boolean> {
  try {
    const { data: { session } } = await createClient().auth.getSession()
    return !!session
  } catch {
    return false
  }
}
