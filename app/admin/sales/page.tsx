import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function AdminSalesPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')

  const { data: purchases } = await supabase
    .from('purchases')
    .select('id, amount, status, created_at, parents(first_name, last_name, email), lesson_packages(name, course_type_id)')
    .order('created_at', { ascending: false })
    .limit(50)

  const total = purchases?.filter(p => p.status === 'completed').reduce((sum, p) => sum + (p.amount || 0), 0) ?? 0

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Sales</h1>
          <p className="text-gray-400 mt-1">Recent lesson package purchases</p>
        </div>
        <div className="bg-[#111d38] border border-[#1e3a6e] rounded-xl px-6 py-4 text-right">
          <p className="text-gray-400 text-xs uppercase tracking-wider">Total Revenue</p>
          <p className="text-[#c9a84c] text-2xl font-bold">${(total / 100).toLocaleString()}</p>
        </div>
      </div>

      {!purchases || purchases.length === 0 ? (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-12 text-center">
          <p className="text-gray-400">No purchases yet</p>
        </div>
      ) : (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1e3a6e]">
                <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">Customer</th>
                <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">Package</th>
                <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">Amount</th>
                <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p: any) => (
                <tr key={p.id} className="border-b border-[#1e3a6e]/50 hover:bg-[#1e3a6e]/20 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-white text-sm">{p.parents?.first_name} {p.parents?.last_name}</p>
                    <p className="text-gray-500 text-xs">{p.parents?.email}</p>
                  </td>
                  <td className="px-5 py-4 text-gray-300 text-sm">{p.lesson_packages?.name || '—'}</td>
                  <td className="px-5 py-4 text-white text-sm font-medium">${((p.amount || 0) / 100).toFixed(2)}</td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      p.status === 'completed' ? 'bg-green-900/40 text-green-400' :
                      p.status === 'pending' ? 'bg-yellow-900/40 text-yellow-400' :
                      'bg-red-900/40 text-red-400'
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-sm">
                    {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
