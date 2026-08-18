import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

export const runtime = 'nodejs'

const URL_TTL_SECONDS = 120

export async function GET(req: Request) {
  const auth = await requireAdmin()
  if (!auth) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) {
    return NextResponse.json({ error: 'Missing application id.' }, { status: 400 })
  }

  const { data: application } = await auth.svc
    .from('coach_applications')
    .select('resume_path')
    .eq('id', id)
    .maybeSingle()

  if (!application?.resume_path) {
    return NextResponse.json({ error: 'No résumé on file.' }, { status: 404 })
  }

  const { data, error } = await auth.svc.storage
    .from('applications')
    .createSignedUrl(application.resume_path, URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Could not open that file.' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
