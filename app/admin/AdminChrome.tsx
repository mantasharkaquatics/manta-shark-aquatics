'use client'

import SignOutButton from './components/SignOutButton'
import PortalLangSwitch from '@/components/PortalLangSwitch'
import { useT } from '@/lib/i18n/provider'

/* Words the server layout renders but cannot translate: t() reads the client
   provider the layout wraps around them. Same arrangement as the coach portal's
   CoachChrome.
 *
 * Each one is its own named export, deliberately. Next.js turns every export of
 * a 'use client' module into a separate client reference; components bundled
 * inside an exported object are not converted, so the server renders undefined
 * and the page dies at runtime -- which neither tsc nor next build catches.
 */

export function AdminPortalLabel() {
  const t = useT()
  return <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-widest">{t('admin.portal')}</p>
}

export function AdminSignOut() {
  const t = useT()
  return <SignOutButton label={t('admin.signOut')} />
}

export function AdminLangSwitch() {
  return <PortalLangSwitch endpoint="/api/admin/ui-language" refreshServer />
}
