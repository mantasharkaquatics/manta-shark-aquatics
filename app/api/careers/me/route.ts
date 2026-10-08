import { NextResponse } from 'next/server'
import { getApplicant, hasLegalName, isFullyVerified } from '@/lib/applicant-auth'
import { serviceClient } from '@/lib/api-auth'

export const runtime = 'nodejs'

function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  if (!domain) return email
  const head = user.slice(0, 2)
  return `${head}${'*'.repeat(Math.max(user.length - 2, 1))}@${domain}`
}

function maskPhone(phone: string): string {
  if (!phone) return ''
  return phone.length > 4 ? `(***) ***-${phone.slice(-4)}` : phone
}

export async function GET() {
  const applicant = await getApplicant()
  if (!applicant) {
    return NextResponse.json({ signedIn: false }, { status: 200 })
  }

  // So the apply page can show "already received" instead of a blank form
  // that is refused only after it has all been filled in (found 2026-10-08).
  const fullyVerified = isFullyVerified(applicant)
  let hasApplied = false
  if (fullyVerified) {
    const { data: prior } = await serviceClient()
      .from('coach_applications')
      .select('id')
      .eq('applicant_id', applicant.id)
      .limit(1)
      .maybeSingle()
    hasApplied = Boolean(prior)
  }

  return NextResponse.json({
    signedIn: true,
    firstName: applicant.legal_first_name,
    emailMasked: maskEmail(applicant.email),
    phoneMasked: maskPhone(applicant.phone),
    emailVerified: Boolean(applicant.email_verified_at),
    phoneVerified: Boolean(applicant.phone_verified_at),
    // Cleared when the email's owner reclaimed the account (reset-password):
    // the verify page asks for them again.
    needsName: !hasLegalName(applicant),
    hasPhone: Boolean(applicant.phone),
    fullyVerified,
    hasApplied,
  })
}
