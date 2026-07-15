import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { requireAdmin } from '@/lib/api-auth'

const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// List coaches
export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await svc()
    .from('coaches')
    .select('id, first_name, last_name, email, is_active, created_at')
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ coaches: data })
}

// Create coach
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { first_name, last_name, email, pin } = await req.json()
  if (!first_name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  }
  if (!/^\d{8}$/.test(pin || '')) {
    return NextResponse.json({ error: 'PIN must be exactly 8 digits' }, { status: 400 })
  }

  const s = svc()
  const pinHash = createHash('sha256').update(pin).digest('hex')

  const { data: dup } = await s.from('coaches').select('id').eq('pin_hash', pinHash).maybeSingle()
  if (dup) return NextResponse.json({ error: 'This PIN is already in use by another coach' }, { status: 409 })

  const { data: authUser, error: authErr } = await s.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    email_confirm: true,
  })
  if (authErr || !authUser?.user) {
    return NextResponse.json({ error: 'Auth account creation failed: ' + (authErr?.message || '') }, { status: 500 })
  }

  const { data: coach, error: coachErr } = await s.from('coaches').insert({
    first_name: first_name.trim(),
    last_name: (last_name || '').trim() || null,
    email: email.trim().toLowerCase(),
    pin_hash: pinHash,
    auth_user_id: authUser.user.id,
    is_active: true,
  }).select().single()

  if (coachErr) {
    await s.auth.admin.deleteUser(authUser.user.id) // rollback
    return NextResponse.json({ error: 'Coach creation failed: ' + coachErr.message }, { status: 500 })
  }
  return NextResponse.json({ coach })
}

// Update coach (name / pin / active toggle)
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, first_name, last_name, pin, is_active } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const s = svc()
  const update: Record<string, unknown> = {}
  if (first_name !== undefined) update.first_name = String(first_name).trim()
  if (last_name !== undefined) update.last_name = String(last_name).trim() || null
  if (is_active !== undefined) update.is_active = !!is_active
  if (pin !== undefined && pin !== '') {
    if (!/^\d{8}$/.test(pin)) return NextResponse.json({ error: 'PIN must be exactly 8 digits' }, { status: 400 })
    const pinHash = createHash('sha256').update(pin).digest('hex')
    const { data: dup } = await s.from('coaches').select('id').eq('pin_hash', pinHash).neq('id', id).maybeSingle()
    if (dup) return NextResponse.json({ error: 'This PIN is already in use by another coach' }, { status: 409 })
    update.pin_hash = pinHash
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { error } = await s.from('coaches').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
