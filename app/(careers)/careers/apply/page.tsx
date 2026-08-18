import type { Metadata } from 'next'
import ApplyForm from './ApplyForm'

export const metadata: Metadata = {
  title: 'Your application | Manta Shark Aquatics Careers',
  robots: { index: false, follow: true },
}

export default function Page() {
  return <ApplyForm />
}
