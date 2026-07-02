import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getAuthUser() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  return user
}

export async function requireUser() {
  const user = await getAuthUser()
  if (!user) return null
  return { user, svc: serviceClient() }
}

export async function requireAdmin() {
  const user = await getAuthUser()
  if (!user) return null
  const svc = serviceClient()
  const { data: admin } = await svc
    .from('admins').select('id, first_name, last_name').eq('auth_user_id', user.id).single()
  if (!admin) return null
  return { user, admin, svc }
}

export async function requireParent() {
  const user = await getAuthUser()
  if (!user) return null
  const svc = serviceClient()
  const { data: parent } = await svc
    .from('parents').select('id, email, first_name').eq('auth_user_id', user.id).single()
  if (!parent) return null
  return { user, parent, svc }
}

export async function requireCoach() {
  const user = await getAuthUser()
  if (!user) return null
  const svc = serviceClient()
  const { data: coach } = await svc
    .from('coaches').select('id, first_name').eq('auth_user_id', user.id).single()
  if (!coach) return null
  return { user, coach, svc }
}

export async function requireStaff() {
  const user = await getAuthUser()
  if (!user) return null
  const svc = serviceClient()
  const { data: admin } = await svc.from('admins').select('id').eq('auth_user_id', user.id).single()
  if (admin) return { user, role: 'admin' as const, svc }
  const { data: coach } = await svc.from('coaches').select('id').eq('auth_user_id', user.id).single()
  if (coach) return { user, role: 'coach' as const, svc }
  return null
}
