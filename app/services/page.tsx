import Link from 'next/link'
import Navbar from '@/components/Navbar'

const privatePackages = [
  { lessons: 10, price: 650, perLesson: 65, savings: 0 },
  { lessons: 20, price: 1260, perLesson: 63, savings: 40 },
  { lessons: 30, price: 1850, perLesson: 62, savings: 100 },
  { lessons: 50, price: 3000, perLesson: 60, savings: 250 },
]

const semiPackages = [
  { lessons: 10, price: 1050, perLesson: 105, savings: 50 },
  { lessons: 20, price: 2000, perLesson: 100, savings: 200 },
  { lessons: 30, price: 2850, perLesson: 95, savings: 450 },
  { lessons: 50, price: 4500, perLesson: 90, savings: 1000 },
]

const groupOptions = [
  { label: '4 classes / month', price: 160 },
  { label: '8 classes / month', price: 300 },
]

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <section className="bg-[#1a2744] text-white py-16 text-center">
        <p className="text-[#c9a84c] text-sm font-semibold tracking-widest uppercase mb-3">What We Offer</p>
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">Our Programs & Pricing</h1>
        <p className="text-gray-300 max-w-xl mx-auto">Choose the program that fits your child. All sessions are with certified coaches.</p>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-16 space-y-20">
        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-4xl">🏊</div>
            <div>
              <h2 className="text-2xl font-bold text-[#1a2744]">1-on-1 Private Lessons</h2>
              <p className="text-gray-500 mt-1">30 minutes · $65 per session · Fully personalized coaching</p>
            </div>
          </div>
          <p className="text-gray-600 mb-8 max-w-2xl">Your child gets the coach full attention for every minute. Perfect for swimmers at any level who want to progress quickly.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {privatePackages.map(pkg => (
              <div key={pkg.lessons} className={`border-2 rounded-2xl p-5 text-center transition-all hover:shadow-md ${pkg.lessons === 20 ? 'border-[#c9a84c] bg-[#c9a84c]/5' : 'border-gray-200'}`}>
                {pkg.lessons === 20 && <div className="text-[#c9a84c] text-xs font-bold uppercase tracking-wide mb-2">Most Popular</div>}
                <div className="text-3xl font-bold text-[#1a2744]">{pkg.lessons}</div>
                <div className="text-gray-500 text-sm mb-3">lessons</div>
                <div className="text-2xl font-bold text-[#1a2744]">${pkg.price.toLocaleString()}</div>
                <div className="text-gray-400 text-xs mt-1">${pkg.perLesson}/lesson</div>
                {pkg.savings > 0 && <div className="text-green-600 text-xs font-semibold mt-2">Save ${pkg.savings}</div>}
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-100" />

        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-4xl">👫</div>
            <div>
              <h2 className="text-2xl font-bold text-[#1a2744]">1-on-2 Semi-Private Lessons</h2>
              <p className="text-gray-500 mt-1">30 minutes · $110 per session · You arrange the pair</p>
            </div>
          </div>
          <p className="text-gray-600 mb-8 max-w-2xl">Great for siblings or friends at similar skill level. Parents arrange their own pairs for a focused, social learning experience.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {semiPackages.map(pkg => (
              <div key={pkg.lessons} className={`border-2 rounded-2xl p-5 text-center transition-all hover:shadow-md ${pkg.lessons === 20 ? 'border-[#c9a84c] bg-[#c9a84c]/5' : 'border-gray-200'}`}>
                {pkg.lessons === 20 && <div className="text-[#c9a84c] text-xs font-bold uppercase tracking-wide mb-2">Most Popular</div>}
                <div className="text-3xl font-bold text-[#1a2744]">{pkg.lessons}</div>
                <div className="text-gray-500 text-sm mb-3">lessons</div>
                <div className="text-2xl font-bold text-[#1a2744]">${pkg.price.toLocaleString()}</div>
                <div className="text-gray-400 text-xs mt-1">${pkg.perLesson}/lesson</div>
                {pkg.savings > 0 && <div className="text-green-600 text-xs font-semibold mt-2">Save ${pkg.savings}</div>}
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-100" />

        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-4xl">👥</div>
            <div>
              <h2 className="text-2xl font-bold text-[#1a2744]">Group Lessons (1-on-4)</h2>
              <p className="text-gray-500 mt-1">30 minutes · Fixed schedule · Limited spots per class</p>
            </div>
          </div>
          <p className="text-gray-600 mb-8 max-w-2xl">Structured group classes with max 4 students per coach. Book online and see real-time availability.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-sm">
            {groupOptions.map(opt => (
              <div key={opt.label} className="border-2 border-gray-200 rounded-2xl p-5 text-center hover:border-[#c9a84c] hover:shadow-md transition-all">
                <div className="text-2xl font-bold text-[#1a2744]">${opt.price}</div>
                <div className="text-gray-500 text-sm mt-1">{opt.label}</div>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-100" />

        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-4xl">🏅</div>
            <div>
              <h2 className="text-2xl font-bold text-[#1a2744]">Swim Team</h2>
              <p className="text-gray-500 mt-1">90 minutes · Mon & Wed 6:00–7:30 PM · Max 24 swimmers</p>
            </div>
          </div>
          <p className="text-gray-600 mb-8 max-w-2xl">Competitive swim training for dedicated swimmers. Focus on stroke technique, endurance, turns, and race strategy.</p>
          <div className="border-2 border-gray-200 rounded-2xl p-6 max-w-xs hover:border-[#c9a84c] hover:shadow-md transition-all">
            <div className="text-3xl font-bold text-[#1a2744]">$180</div>
            <div className="text-gray-500 text-sm mt-1">per month</div>
            <div className="text-gray-400 text-xs mt-3">Mon & Wed · 6:00–7:30 PM<br />Maximum 24 swimmers</div>
          </div>
        </section>
      </div>

      <section className="bg-[#1a2744] py-16 text-center text-white">
        <h2 className="text-3xl font-bold mb-4">Ready to Sign Up?</h2>
        <p className="text-gray-300 mb-8">Create your account and enroll your child today.</p>
        <Link href="/register" className="inline-block bg-[#c9a84c] hover:bg-[#b8962e] text-white font-bold px-10 py-4 rounded-xl text-lg transition-colors">
          Create Account
        </Link>
      </section>

      <footer className="bg-[#111d38] text-gray-400 py-8 text-center text-sm">
        <p>© {new Date().getFullYear()} Manta Shark Aquatics. All rights reserved.</p>
      </footer>
    </div>
  )
}
