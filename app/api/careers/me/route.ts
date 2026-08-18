import { NextResponse } from 'next/server'
import { getApplicant, isFullyVerified } from '@/lib/applicant-auth'

export const runtime = 'nodejs'

function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  if (!domain) return email
  const head = user.slice(0, 2)
  return `${head}${'*'.repeat(Math.max(user.length - 2, 1))}@${domain}`
}

function maskPhone(phone: string): string {
  return phone.length > 4 ? `(***) ***-${phone.slice(-4)}` : phone
}

export async function GET() {
  const applicant = await getApplicant()
  if (!applicant) {
    return NextResponse.json({ signedIn: false }, { status: 200 })
  }

  return NextResponse.json({
    signedIn: true,
    firstName: applicant.legal_first_name,
    emailMasked: maskEmail(applicant.email),
    phoneMasked: maskPhone(applicant.phone),
    emailVerified: Boolean(applicant.email_verified_at),
    phoneVerified: Boolean(applicant.phone_verified_at),
    fullyVerified: isFullyVerified(applicant),
  })
}
