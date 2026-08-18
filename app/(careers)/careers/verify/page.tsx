import type { Metadata } from 'next'
import VerifyForm from './VerifyForm'

export const metadata: Metadata = {
  title: 'Verify your account | Manta Shark Aquatics Careers',
  robots: { index: false, follow: true },
}

export default function Page() {
  return <VerifyForm />
}
