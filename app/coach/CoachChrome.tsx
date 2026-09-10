'use client'

import SignOutButton from '../admin/components/SignOutButton'
import { useT } from '@/lib/i18n/provider'

/* Two words the server layout renders but cannot translate: the layout is a
   server component and t() reads the client provider it wraps. Keeping them
   here is cheaper than turning the whole header into a client component. */
function PortalLabel() {
  const t = useT()
  return <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-widest">{t('coach.portal')}</p>
}

function SignOut() {
  const t = useT()
  return <SignOutButton label={t('coach.signOut')} />
}

const CoachChrome = { PortalLabel, SignOut }
export default CoachChrome
