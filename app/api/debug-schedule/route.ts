import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('bookings')
    .select('id, pending_expires_at, status, pending_action')
    .eq('status', 'pending_partner')
    .eq('pending_action', 'confirm')
    .gt('pending_expires_at', now)
  return NextResponse.json({ now, data, error, key_prefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0,20) })
}
