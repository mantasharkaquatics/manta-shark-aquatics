import LegalPage from '@/components/brand/LegalPage'
import { LEGAL_VERSIONS } from '@/lib/legal'

export const metadata = { title: 'Liability Waiver — Manta Shark Aquatics' }

export default function Page() {
  return (
    <LegalPage
      title="Liability Waiver"
      subtitle="Release of liability and assumption of risk for swim instruction."
      meta={<>Version: {LEGAL_VERSIONS.waiver} · Last updated July 2, 2026</>}
    >
          <h2>Assumption of Risk</h2>
          <p>I understand that swimming and swim instruction involve inherent risks, including but not limited to drowning, slips and falls, collisions, muscle strain, and illness from waterborne contaminants. I acknowledge that these risks cannot be entirely eliminated even with proper instruction and supervision, and I voluntarily accept and assume all such risks on behalf of myself and my minor child(ren) enrolled at Manta Shark Aquatics.</p>
          <h2>Release of Liability</h2>
          <p>In consideration of my child(ren) being permitted to participate in swim lessons and related activities, I, on behalf of myself, my child(ren), and our heirs and assigns, hereby release, waive, and discharge Manta Shark Aquatics, its owners, coaches, employees, and agents from any and all claims, demands, or causes of action arising out of or related to any loss, damage, or injury sustained while participating in lessons or while on the premises, to the fullest extent permitted by California law. I understand this release does not apply to gross negligence, recklessness, or intentional misconduct.</p>
          <h2>Indemnification</h2>
          <p>I agree to indemnify and hold harmless Manta Shark Aquatics from any claims brought by or on behalf of my child(ren) arising from participation in lessons, except to the extent caused by the School’s gross negligence or willful misconduct.</p>
          <h2>Medical Authorization</h2>
          <p>In the event of an emergency, I authorize the staff of Manta Shark Aquatics to secure emergency medical treatment for my child(ren), including contacting emergency services. I understand that I am responsible for any resulting medical expenses. I confirm that I have disclosed all relevant medical conditions during registration.</p>
          <h2>Swim Ability Acknowledgment</h2>
          <p>I understand that swim lessons do not make a child “drown-proof” and that constant supervision around water remains essential outside of lessons. Level assignments reflect instructional progress only and are not a certification of unsupervised swim ability.</p>
          <h2>Acknowledgment</h2>
          <p>I confirm that I am the parent or legal guardian of the enrolled student(s), that I am at least 18 years old, that I have read and understood this waiver, and that I accept it voluntarily by checking the corresponding box during registration. My electronic acceptance has the same legal effect as a handwritten signature.</p>

    </LegalPage>
  )
}
