'use client'

import SignOutButton from '../admin/components/SignOutButton'
import { useT } from '@/lib/i18n/provider'

/* Two words the server layout renders but cannot translate: the layout is a
   server component and t() reads the client provider it wraps. Keeping them
   here is cheaper than turning the whole header into a client component.
 *
 * Each one is its own named export, deliberately. Next.js turns every export of
 * a 'use client' module into a separate client reference; components bundled
 * inside an exported object are not converted, so the server renders undefined
 * and the page dies at runtime -- which neither tsc nor next build catches.
 */

export function CoachPortalLabel() {
  const t = useT()
  return <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-widest">{t('coach.portal')}</p>
}

export function CoachSignOut() {
  const t = useT()
  return <SignOutButton label={t('coach.signOut')} />
}
