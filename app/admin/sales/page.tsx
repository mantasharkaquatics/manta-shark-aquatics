import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AdminSalesPage() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) redirect('/login')

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')

  // 查所有 invoices，按 issued_at 排序
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, amount, payment_method, items, status, issued_at, parent_id')
    .order('issued_at', { ascending: false })
    .limit(200)

  // 查所有相關 parents
  const parentIds = [...new Set((invoices || []).map((i: any) => i.parent_id).filter(Boolean))]
  const parentMap: Record<string, any> = {}
  if (parentIds.length > 0) {
    const { data: parents } = await supabase.from('parents').select('id, first_name, last_name, email').in('id', parentIds)
    for (const p of parents || []) parentMap[p.id] = p
  }

  const total = (invoices || []).filter((i: any) => i.status !== 'draft').reduce((sum: number, i: any) => sum + (i.amount || 0), 0)

  const fDate = (s: string) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' }) : '—'
  const fTime = (s: string) => s ? new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' }) : ''

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-serif">Sales</h1>
          <p className="text-gray-400 mt-1">所有課程購買紀錄</p>
        </div>
        <div className="bg-[#111d38] border border-[#1e3a6e] rounded-xl px-6 py-4 text-right">
          <p className="text-gray-400 text-xs uppercase tracking-wider">Total Revenue</p>
          <p className="text-[#c9a84c] text-2xl font-bold">${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {!invoices || invoices.length === 0 ? (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-12 text-center">
          <p className="text-gray-400">No purchases yet</p>
        </div>
      ) : (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1e3a6e]">
                <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">發票編號</th>
                <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">客戶</th>
                <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">購買方案</th>
                <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">付款方式</th>
                <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">金額</th>
                <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">購買時間</th>
              </tr>
            </thead>
            <tbody>
              {(invoices as any[]).map((inv) => {
                const parent = parentMap[inv.parent_id]
                const planName = Array.isArray(inv.items) && inv.items[0]?.name ? inv.items[0].name : '—'
                return (
                  <tr key={inv.id} className="border-b border-[#1e3a6e]/50 hover:bg-[#1e3a6e]/20 transition-colors">
                    <td className="px-5 py-4 text-gray-400 text-xs font-mono">{inv.invoice_number}</td>
                    <td className="px-5 py-4">
                      <p className="text-white text-sm">{parent ? `${parent.first_name} ${parent.last_name}` : '—'}</p>
                      <p className="text-gray-500 text-xs">{parent?.email}</p>
                    </td>
                    <td className="px-5 py-4 text-gray-300 text-sm">{planName}</td>
                    <td className="px-5 py-4 text-gray-400 text-xs">{inv.payment_method || '—'}</td>
                    <td className="px-5 py-4 text-white text-sm font-medium">${(inv.amount || 0).toFixed(2)}</td>
                    <td className="px-5 py-4 text-gray-400 text-sm">
                      {fDate(inv.issued_at)}<br/>
                      <span className="text-xs text-gray-600">{fTime(inv.issued_at)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
