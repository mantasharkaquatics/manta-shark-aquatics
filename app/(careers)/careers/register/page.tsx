import type { Metadata } from 'next'
import RegisterForm from './RegisterForm'

export const metadata: Metadata = {
  title: 'Create an account | Manta Shark Aquatics Careers',
  description: 'Create an account to apply for a position at Manta Shark Aquatics.',
  robots: { index: false, follow: true },
}

export default function Page() {
  return <RegisterForm />
}
