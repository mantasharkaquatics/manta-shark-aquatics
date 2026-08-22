'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'

const privatePackages = [
  { lessons: 10, price: 650, perLesson: 65, savings: 0 },
  { lessons: 20, price: 1260, perLesson: 63, savings: 40 },
  { lessons: 30, price: 1850, perLesson: 61.67, savings: 100 },
  { lessons: 50, price: 3000, perLesson: 60, savings: 250 },
]

const semiPackages = [
  { lessons: 10, price: 1050, perLesson: 105, savings: 0 },
  { lessons: 20, price: 2000, perLesson: 100, savings: 100 },
  { lessons: 30, price: 2850, perLesson: 95, savings: 300 },
  { lessons: 50, price: 4500, perLesson: 90, savings: 750 },
]

const groupOptions = [
  { classes: 4, price: 160 },
  { classes: 8, price: 300 },
]

export default function ServicesContent() {
  const t = useT()

  return (
    <div className="min-h-screen bg-white">

      <section className="bg-[#1a2744] text-white py-16 text-center">
        <p className="text-[#c9a84c] text-sm font-semibold tracking-widest uppercase mb-3">{t('services.hero.eyebrow')}</p>
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">{t('services.hero.title')}</h1>
        <p className="text-gray-300 max-w-xl mx-auto">{t('services.hero.subtitle')}</p>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-16 space-y-20">
        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-4xl">🏊</div>
            <div>
              <h2 className="text-2xl font-bold text-[#1a2744]">{t('services.private.title')}</h2>
              <p className="text-gray-500 mt-1">{t('services.private.meta')}</p>
            </div>
          </div>
          <p className="text-gray-600 mb-8 max-w-2xl">{t('services.private.desc')}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {privatePackages.map(pkg => (
              <div key={pkg.lessons} className={`border-2 rounded-2xl p-5 text-center transition-all hover:shadow-md ${pkg.lessons === 20 ? 'border-[#c9a84c] bg-[#c9a84c]/5' : 'border-gray-200'}`}>
                {pkg.lessons === 20 && <div className="text-[#c9a84c] text-xs font-bold uppercase tracking-wide mb-2">{t('services.pkg.popular')}</div>}
                <div className="text-3xl font-bold text-[#1a2744]">{pkg.lessons}</div>
                <div className="text-gray-500 text-sm mb-3">{t('services.pkg.lessons')}</div>
                <div className="text-2xl font-bold text-[#1a2744]">${pkg.price.toLocaleString()}</div>
                <div className="text-gray-400 text-xs mt-1">{t('services.pkg.perLesson', { price: pkg.perLesson })}</div>
                {pkg.savings > 0 && <div className="text-green-600 text-xs font-semibold mt-2">{t('services.pkg.save', { amount: pkg.savings.toLocaleString() })}</div>}
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-100" />

        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-4xl">👫</div>
            <div>
              <h2 className="text-2xl font-bold text-[#1a2744]">{t('services.semi.title')}</h2>
              <p className="text-gray-500 mt-1">{t('services.semi.meta')}</p>
            </div>
          </div>
          <p className="text-gray-600 mb-8 max-w-2xl">{t('services.semi.desc')}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {semiPackages.map(pkg => (
              <div key={pkg.lessons} className={`border-2 rounded-2xl p-5 text-center transition-all hover:shadow-md ${pkg.lessons === 20 ? 'border-[#c9a84c] bg-[#c9a84c]/5' : 'border-gray-200'}`}>
                {pkg.lessons === 20 && <div className="text-[#c9a84c] text-xs font-bold uppercase tracking-wide mb-2">{t('services.pkg.popular')}</div>}
                <div className="text-3xl font-bold text-[#1a2744]">{pkg.lessons}</div>
                <div className="text-gray-500 text-sm mb-3">{t('services.pkg.lessons')}</div>
                <div className="text-2xl font-bold text-[#1a2744]">${pkg.price.toLocaleString()}</div>
                <div className="text-gray-400 text-xs mt-1">{t('services.pkg.perLesson', { price: pkg.perLesson })}</div>
                {pkg.savings > 0 && <div className="text-green-600 text-xs font-semibold mt-2">{t('services.pkg.save', { amount: pkg.savings.toLocaleString() })}</div>}
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-100" />

        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-4xl">👥</div>
            <div>
              <h2 className="text-2xl font-bold text-[#1a2744]">{t('services.group.title')}</h2>
              <p className="text-gray-500 mt-1">{t('services.group.meta')}</p>
            </div>
          </div>
          <p className="text-gray-600 mb-8 max-w-2xl">{t('services.group.desc')}</p>
          {/* max-w-sm caps the whole grid, so on a phone this section rendered as a
              384px column hugging the left edge while every other tier above it ran
              the full width -- it read as a layout fault rather than a design. Two
              across on mobile like the other tiers; the cap only applies from sm up,
              where it stops two small cards stretching across the page. */}
          <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
            {groupOptions.map(opt => (
              <div key={opt.classes} className="border-2 border-gray-200 rounded-2xl p-5 text-center hover:border-[#c9a84c] hover:shadow-md transition-all">
                <div className="text-2xl font-bold text-[#1a2744]">${opt.price}</div>
                <div className="text-gray-500 text-sm mt-1">{t('services.group.perMonth', { n: opt.classes })}</div>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-100" />

        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-4xl">🏅</div>
            <div>
              <h2 className="text-2xl font-bold text-[#1a2744]">{t('services.team.title')}</h2>
              <p className="text-gray-500 mt-1">{t('services.team.meta')}</p>
            </div>
          </div>
          <p className="text-gray-600 mb-8 max-w-2xl">{t('services.team.desc')}</p>
        </section>
      </div>

      <section className="bg-[#1a2744] py-16 text-center text-white">
        <h2 className="text-3xl font-bold mb-4">{t('services.cta.title')}</h2>
        <p className="text-gray-300 mb-8">{t('services.cta.subtitle')}</p>
        <Link href="/register" className="inline-block bg-[#c9a84c] hover:bg-[#b8962e] text-white font-bold px-10 py-4 rounded-xl text-lg transition-colors">
          {t('services.cta.button')}
        </Link>
      </section>

    </div>
  )
}
