import type { Metadata } from 'next'
import LoginForm from './LoginForm'

export const metadata: Metadata = {
  title: 'Sign in | Manta Shark Aquatics Careers',
  robots: { index: false, follow: true },
}

export default function Page() {
  return <LoginForm />
}
