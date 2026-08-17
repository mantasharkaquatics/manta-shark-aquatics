import type { Metadata } from 'next'
import PoliciesContent from './PoliciesContent'

export const metadata: Metadata = { title: 'Terms & Policies — Manta Shark Aquatics' }

export default function Page() {
  return <PoliciesContent />
}
