import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { serviceClient } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { getApplicant, isFullyVerified, hashIp } from '@/lib/applicant-auth'

export const runtime = 'nodejs'

const ROLE_LABELS: Record<string, string> = {
  swim_coach: 'Swim coach',
  front_desk: 'Front desk',
  lifeguard: 'Lifeguard',
  other: 'Something else',
}

const ROLES = ['swim_coach', 'front_desk', 'lifeguard', 'other']
const MAX_RESUME_BYTES = 5 * 1024 * 1024
const ALLOWED_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

function clean(value: FormDataEntryValue | null, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function POST(req: Request) {
  const applicant = await getApplicant()
  if (!applicant) {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  }
  if (!isFullyVerified(applicant)) {
    return NextResponse.json(
      { error: 'Please verify your email and phone number first.' },
      { status: 403 }
    )
  }

  const supabase = serviceClient()

  const { data: prior } = await supabase
    .from('coach_applications')
    .select('id')
    .eq('applicant_id', applicant.id)
    .limit(1)
    .maybeSingle()

  if (prior) {
    return NextResponse.json(
      { error: 'You have already submitted an application. Contact us to update it.' },
      { status: 409 }
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const roleApplied = clean(form.get('roleApplied'), 40)
  const swimExperience = clean(form.get('swimExperience'), 4000)
  const is18 = form.get('is18OrOver') === 'true'
  const workAuthorized = form.get('workAuthorized') === 'true'

  if (!ROLES.includes(roleApplied)) {
    return NextResponse.json({ error: 'Please choose a position.' }, { status: 400 })
  }
  if (!swimExperience) {
    return NextResponse.json(
      { error: 'Please tell us about your swimming experience.' },
      { status: 400 }
    )
  }
  if (!is18 || !workAuthorized) {
    return NextResponse.json(
      { error: 'Both eligibility boxes must be checked to apply.' },
      { status: 400 }
    )
  }

  const applicationId = crypto.randomUUID()
  let resumePath: string | null = null

  const resume = form.get('resume')
  if (!(resume instanceof File) || resume.size === 0) {
    return NextResponse.json(
      { error: 'Please attach your résumé.' },
      { status: 400 }
    )
  }
  if (resume.size > MAX_RESUME_BYTES) {
    return NextResponse.json(
      { error: 'That file is larger than 5 MB. Please upload a smaller one.' },
      { status: 400 }
    )
  }
  const ext = ALLOWED_EXT[resume.type]
  if (!ext) {
    return NextResponse.json(
      { error: 'Please upload a PDF or Word document.' },
      { status: 400 }
    )
  }

  const path = `${applicationId}/resume.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('applications')
    .upload(path, resume, { contentType: resume.type, upsert: false })

  if (uploadError) {
    return NextResponse.json(
      { error: 'We could not save your file. Please try again.' },
      { status: 500 }
    )
  }
  resumePath = path

  const fwd = req.headers.get('x-forwarded-for')
  const ip = fwd ? fwd.split(',')[0].trim() : null

  const { error } = await supabase.from('coach_applications').insert({
    id: applicationId,
    applicant_id: applicant.id,
    role_applied: roleApplied,
    full_name: `${applicant.legal_first_name} ${applicant.legal_last_name}`,
    email: applicant.email,
    phone: applicant.phone,
    city: clean(form.get('city'), 120) || null,
    is_18_or_over: is18,
    work_authorized: workAuthorized,
    swim_experience: swimExperience,
    certifications: clean(form.get('certifications'), 2000) || null,
    availability: clean(form.get('availability'), 2000) || null,
    weekly_hours: clean(form.get('weeklyHours'), 60) || null,
    earliest_start: clean(form.get('earliestStart'), 10) || null,
    referral_source: clean(form.get('referralSource'), 200) || null,
    message: clean(form.get('message'), 4000) || null,
    resume_path: resumePath,
    ip_hash: hashIp(ip),
    user_agent: req.headers.get('user-agent'),
  })

  if (error) {
    if (resumePath) {
      await supabase.storage.from('applications').remove([resumePath])
    }
    return NextResponse.json(
      { error: 'We could not submit your application. Please try again.' },
      { status: 500 }
    )
  }

  const notifyTo = process.env.CAREERS_NOTIFY_EMAIL
  if (notifyTo) {
    try {
      await sendEmail({
        type: 'applicant_application_received',
        to: notifyTo,
        applicantName: `${applicant.legal_first_name} ${applicant.legal_last_name}`,
        applicantEmail: applicant.email,
        applicantPhone: applicant.phone,
        applicantCity: clean(form.get('city'), 120),
        roleLabel: ROLE_LABELS[roleApplied] || roleApplied,
        hasResume: Boolean(resumePath),
        appUrl: process.env.NEXT_PUBLIC_APP_URL || '',
      })
    } catch (e) {
      console.error('applicant notification failed', e)
    }
  } else {
    console.error('CAREERS_NOTIFY_EMAIL is not set; no application notification sent')
  }

  return NextResponse.json({ ok: true })
}
