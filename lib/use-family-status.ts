'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type FamilyStatus = {
  /** null until the browser has looked; then whether anyone is signed in. */
  signedIn: boolean | null
  /** A signed-in family with at least one active swimmer, every one of them
   *  with a level: the assessment is behind them. False while unknown. */
  allAssessed: boolean
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
  const [status, setStatus] = useState<FamilyStatus>({ signedIn: null, allAssessed: false })
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!live) return
        if (!session) { setStatus({ signedIn: false, allAssessed: false }); return }
        setStatus({ signedIn: true, allAssessed: false })
        const { data: p } = await supabase.from('parents').select('id').eq('auth_user_id', session.user.id).maybeSingle()
        if (!p) return
        const { data: kids } = await supabase.from('students').select('current_level').eq('parent_id', p.id).eq('is_active', true)
        if (live && kids && kids.length > 0 && kids.every((k: { current_level: number | null }) => k.current_level != null)) {
          setStatus({ signedIn: true, allAssessed: true })
        }
      } catch {
        if (live) setStatus(s => s.signedIn === null ? { signedIn: false, allAssessed: false } : s)
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
