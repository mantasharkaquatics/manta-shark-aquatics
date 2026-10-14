import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/api-auth'
import BirthdaysClient from './BirthdaysClient'

export const dynamic = 'force-dynamic'

// Birthday cards (lib/birthday.ts): who has a birthday, what their card is,
// whether it went out, and a test card to yourself.
export default async function AdminBirthdaysPage() {
  const auth = await requireAdmin()
  if (!auth) redirect('/login')
  return <BirthdaysClient />
}
