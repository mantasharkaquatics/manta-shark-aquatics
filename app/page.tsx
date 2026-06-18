import Image from 'next/image'
import Link from 'next/link'
import Navbar from '@/components/Navbar'

const reviews = [
  {
    text: "The consistency of great quality teaching and positive reinforcement encourages children to perform at their best. My kids have improved so much and are now more comfortable in the water.",
    author: "Mercy",
    stars: 5,
  },
  {
    text: "We love the coaches. They are patient and caring. The swimming lessons are fun, engaging, and creative. My children look forward to every lesson — and wish they lasted longer!",
    author: "Parent",
    stars: 5,
  },
  {
    text: "Coaches are very professional and know how to teach kids. I also like the fun and friendly learning environment. Teaching lifesaving skills first was something I really appreciated.",
    author: "Anonymous",
    stars: 5,
  },
]

const stats = [
  { value: '5.0★', label: 'Average Rating' },
  { value: '500+', label: 'Students Coached' },
  { value: '100%', label: 'Progress-Focused' },
]

const services = [
  { title: '1-on-1 Lessons', desc: '30-minute private sessions tailored entirely to your child\'s pace and goals.', icon: '🏊' },
  { title: '1-on-2 Lessons', desc: '30-minute semi-private sessions — parent-arranged pairs for a shared experience.', icon: '👫' },
  { title: 'Group (1-on-4)', desc: '30-minute group classes with real-time availability. Book online, limited spots.', icon: '👥' },
  { title: 'Swim Team', desc: '90-minute competitive training. Mon & Wed 6–7:30 PM. Max 24 swimmers.', icon: '🏅' },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <section className="bg-[#1a2744] text-white pt-20 pb-28 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <svg viewBox="0 0 1440 400" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path d="M0,200 C360,100 720,300 1080,200 C1260,150 1350,175 1440,200 L1440,400 L0,400 Z" fill="white"/>
          </svg>
        </div>
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <p className="text-[#c9a84c] text-sm font-semibold tracking-widest uppercase mb-4">Serious · Structured · Science-Based</p>
          <h1 className="text-5xl sm:text-6xl font-bold leading-tight mb-4">Serious About Swimming.</h1>
          <p className="text-4xl sm:text-5xl font-light text-[#c9a84c] italic mb-8">Designed for Peace of Mind.</p>
          <p className="text-gray-300 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            We combine professional swim coaching with expertise in education, psychology, and child development — delivering safe, structured, and progression-based instruction for every student.
          </p>
          <div className="flex flex-wrap justify-center gap-6 mb-10">
            {stats.map(s => (
              <div key={s.label} className="bg-white/10 backdrop-blur rounded-xl px-6 py-3 text-center">
                <div className="text-[#c9a84c] font-bold text-xl">{s.value}</div>
                <div className="text-gray-300 text-xs mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <Link href="/register" className="inline-block bg-[#c9a84c] hover:bg-[#b8962e] text-white font-bold px-10 py-4 rounded-xl text-lg transition-colors shadow-lg">
            CREATE ACCOUNT
          </Link>
        </div>
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,40 C360,80 720,0 1080,40 C1260,60 1350,50 1440,40 L1440,80 L0,80 Z" fill="white"/>
          </svg>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-[#c9a84c] text-sm font-semibold tracking-widest uppercase mb-2">What We Offer</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#1a2744]">Our Programs</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map(s => (
              <div key={s.title} className="border border-gray-200 rounded-2xl p-6 hover:border-[#c9a84c] hover:shadow-md transition-all">
                <div className="text-4xl mb-4">{s.icon}</div>
                <h3 className="font-bold text-[#1a2744] text-lg mb-2">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link href="/services" className="inline-block border-2 border-[#1a2744] text-[#1a2744] hover:bg-[#1a2744] hover:text-white font-semibold px-8 py-3 rounded-xl transition-colors">
              View All Services
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 bg-[#1a2744]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-[#c9a84c] text-sm font-semibold tracking-widest uppercase mb-2">Testimonials</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">Our Parents & Swimmers Love Us!</h2>
            <div className="flex items-center justify-center gap-2 mt-3">
              <span className="text-[#c9a84c] text-xl">★★★★★</span>
              <span className="text-gray-300 text-sm">5.0 · 13 reviews</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {reviews.map((r, i) => (
              <div key={i} className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/10">
                <div className="text-[#c9a84c] text-3xl mb-3">"</div>
                <p className="text-gray-200 text-sm leading-relaxed mb-6">{r.text}</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#c9a84c] flex items-center justify-center text-white font-bold text-sm">{r.author[0]}</div>
                  <div>
                    <p className="text-white font-medium text-sm">{r.author}</p>
                    <p className="text-[#c9a84c] text-xs">{'★'.repeat(r.stars)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-white text-center">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#1a2744] mb-4">Ready to Get Started?</h2>
          <p className="text-gray-500 mb-8">Create your family account today and take the first step toward confident, capable swimming.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="bg-[#c9a84c] hover:bg-[#b8962e] text-white font-bold px-8 py-4 rounded-xl transition-colors">Create Account</Link>
            <Link href="/plans" className="border-2 border-[#1a2744] text-[#1a2744] hover:bg-[#1a2744] hover:text-white font-semibold px-8 py-4 rounded-xl transition-colors">View Swim Plans</Link>
          </div>
        </div>
      </section>

      <footer className="bg-[#111d38] text-gray-400 py-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Manta Shark Aquatics" width={64} height={64} className="rounded-full object-cover" />
              <div>
                <p className="text-white font-bold text-sm">Manta Shark Aquatics</p>
                <p className="text-xs">Southern California</p>
              </div>
            </div>
            <div className="flex gap-6 text-sm flex-wrap justify-center">
              <Link href="/services" className="hover:text-[#c9a84c] transition-colors">Services</Link>
              <Link href="/levels" className="hover:text-[#c9a84c] transition-colors">Swim Levels</Link>
              <Link href="/plans" className="hover:text-[#c9a84c] transition-colors">Swim Plans</Link>
              <Link href="/about" className="hover:text-[#c9a84c] transition-colors">About Us</Link>
              <Link href="/policies" className="hover:text-[#c9a84c] transition-colors">Policies</Link>
            </div>
            <div className="flex gap-4">
              <a href="#" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-[#c9a84c] transition-colors text-white text-sm">f</a>
              <a href="#" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-[#c9a84c] transition-colors text-white text-sm">in</a>
            </div>
          </div>
          <div className="border-t border-white/10 mt-8 pt-6 text-center text-xs">
            © {new Date().getFullYear()} Manta Shark Aquatics. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
