import LegalPage from '@/components/brand/LegalPage'
import { LEGAL_VERSIONS } from '@/lib/legal'

export const metadata = { title: 'Photo & Video Release — Manta Shark Aquatics' }

export default function Page() {
  return (
    <LegalPage
      title="Photo & Video Release"
      subtitle="Optional consent for promotional use of lesson photos and videos."
      meta={<>Version: {LEGAL_VERSIONS.media} · Last updated July 2, 2026</>}
    >
          <h2>Grant of Permission</h2>
          <p>By opting in, I grant Manta Shark Aquatics permission to photograph and video record my child(ren) during lessons and School events, and to use such media for the School’s promotional purposes, including the School website, social media accounts, and printed marketing materials.</p>
          <h2>Conditions</h2>
          <p>Media will never be sold to third parties. Student full names will not be published alongside images without separate written consent. No compensation will be provided for the use of such media.</p>
          <h2>Optional & Revocable</h2>
          <p>This release is entirely optional and is not a condition of enrollment. You may opt in or out at registration, and you may revoke consent at any time by emailing info@mantasharkaquatics.net, after which we will cease new use of your child’s media and remove identified images from our active channels within a reasonable time.</p>

    </LegalPage>
  )
}
