import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: parent } = await supabase
    .from('parents')
    .select('*, students(*)')
    .eq('auth_user_id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome, {parent?.first_name}!
          </h1>
          <p className="text-gray-500 mt-1">Manta Shark Aquatics Member Portal</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {parent?.students?.map((student: any) => (
            <div key={student.id} className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 font-semibold text-sm">
                    {student.full_name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{student.full_name}</p>
                  <p className="text-sm text-gray-500">Level {student.current_level}</p>
                </div>
              </div>
              <div className="bg-blue-50 rounded-xl px-4 py-2 text-sm text-blue-700 font-medium text-center">
                Level {student.current_level} — Active
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Book a Class', icon: '📅', href: '/booking' },
            { label: 'My Schedule', icon: '🗓', href: '/schedule' },
            { label: 'Progress', icon: '📈', href: '/progress' },
            { label: 'Account', icon: '👤', href: '/profile' },
          ].map(item => (
            <a key={item.label} href={item.href}
              className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-blue-300 hover:shadow-sm transition">
              <div className="text-2xl mb-2">{item.icon}</div>
              <p className="text-sm font-medium text-gray-700">{item.label}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
