'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import { myFamilyRole, knownFamilyRole, subscribeFamilyRole, type FamilyRole } from '@/lib/my-parent'

/* The signed-in person's role in the family: undefined while not known yet
   (nothing only the main account may do is drawn then -- 14-role test 2,
   J08), null when signed out. Remembered for the tab, so a page after the
   first knows at once; asked again in the background. */
export function useFamilyRole(): FamilyRole | undefined {
  const role = useSyncExternalStore(subscribeFamilyRole, knownFamilyRole, () => undefined)
  useEffect(() => { myFamilyRole(createClient()).catch(() => {}) }, [])
  return role
}

/* Is the signed-in person a view-only family member? For pages that only need
   to leave out what a viewer cannot do (the server refuses it regardless).
   false while unknown and for anyone signed out. */
export function useIsViewer(): boolean {
  return useFamilyRole() === 'viewer'
}
