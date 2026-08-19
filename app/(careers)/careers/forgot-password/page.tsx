import type { Metadata } from 'next'
import ForgotPasswordForm from './ForgotPasswordForm'

export const metadata: Metadata = {
  title: 'Reset password | Manta Shark Aquatics Careers',
  robots: { index: false, follow: true },
}

export default function Page() {
  return <ForgotPasswordForm />
}
