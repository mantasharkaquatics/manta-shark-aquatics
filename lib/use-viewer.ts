'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { myFamilyRole } from '@/lib/my-parent'

/* Is the signed-in person a view-only family member? For pages that only need
   to leave out what a viewer cannot do (the server refuses it regardless).
   false while unknown and for anyone signed out. */
export function useIsViewer(): boolean {
  const [viewer, setViewer] = useState(false)
  useEffect(() => {
    let live = true
    myFamilyRole(createClient()).then(r => { if (live) setViewer(r === 'viewer') }).catch(() => {})
    return () => { live = false }
  }, [])
  return viewer
}
