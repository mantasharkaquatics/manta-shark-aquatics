'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { createClient } from '@/lib/supabase/client'
import ChatWidget from '@/components/ChatWidget'
import { FAQ } from '@/lib/faq'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'
const EMAIL = 'info@mantasharkaquatics.net'

/** Fold case and strip the punctuation that differs between how a parent types
 *  a question and how we wrote it, so "24小時" finds "24 小時". CJK has no word
 *  boundaries, so this is substring matching on purpose. */
function normalise(s: string) {
  return s.toLowerCase().replace(/[\s·、，,。.？?！!—–\-()（）「」“”"']/g, '')
}

export default function FaqContent() {
  const t = useT()
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [parentId, setParentId] = useState<string | null>(null)
  const [seed, setSeed] = useState<{ text: string; n: number } | null>(null)

  // The chat widget belongs to signed-in parents. A visitor who is not signed
  // in gets the email address instead of a button that would do nothing.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('parents').select('id').eq('auth_user_id', user.id).single()
        .then(({ data }) => { if (data) setParentId(data.id) })
    })
  }, [])

  const q = normalise(query)
  const sections = useMemo(() => FAQ.map(cat => ({
    id: cat.id,
    items: cat.items.filter(id =>
      !q || normalise(t('faq.q.' + id)).includes(q) || normalise(t('faq.a.' + id)).includes(q)
    ),
  })).filter(s => s.items.length > 0), [q, locale])

  const matchCount = sections.reduce((n, s) => n + s.items.length, 0)

  function askUs(text: string) {
    if (parentId) {
      setSeed({ text, n: (seed?.n ?? 0) + 1 })
    } else {
      window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(text || 'Question')}`
    }
  }

  const askButtons = (labelChat: string, labelEmail: string, text: string) => (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
      {parentId ? (
        <button onClick={() => askUs(text)}
          style={{ padding: '11px 20px', borderRadius: '10px', border: 'none', background: GOLD, color: NAVY, fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          {labelChat}
        </button>
      ) : (
        <a href={`mailto:${EMAIL}${text ? '?subject=' + encodeURIComponent(text) : ''}`}
          style={{ padding: '11px 20px', borderRadius: '10px', background: GOLD, color: NAVY, fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
          {labelEmail}
        </a>
      )}
    </div>
  )

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: '100vh', background: DARK }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      <section style={{ background: NAVY, position: 'relative', overflow: 'hidden', padding: 'clamp(80px,10vw,104px) clamp(24px,5vw,72px) clamp(32px,4vw,44px)' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1.5px, transparent 1.5px)', backgroundSize: '22px 22px' }} />
        <div style={{ maxWidth: '820px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, margin: '0 0 10px' }}>{t('faq.hero.eyebrow')}</p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(26px,3.4vw,42px)', fontWeight: 900, color: '#fff', lineHeight: 1.15, margin: '0 0 14px', textWrap: 'balance' }}>
            {t('faq.hero.title')}
          </h1>
          <p style={{ fontSize: '15px', lineHeight: 1.8, color: 'rgba(255,255,255,0.6)', margin: '0 0 24px', maxWidth: '58ch' }}>
            {t('faq.hero.sub')}
          </p>
          <div style={{ position: 'relative', maxWidth: '460px' }}>
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(null) }}
              placeholder={t('faq.search.placeholder')}
              aria-label={t('faq.search.placeholder')}
              style={{
                width: '100%', padding: '13px 16px', paddingRight: query ? '4.5rem' : '16px',
                borderRadius: '10px', border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            {query && (
              <button onClick={() => setQuery('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: '6px 8px' }}>
                {t('faq.search.clear')}
              </button>
            )}
          </div>
          {query && (
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', margin: '10px 0 0' }} aria-live="polite">
              {matchCount === 1 ? t('faq.search.countOne') : t('faq.search.count', { n: matchCount })}
            </p>
          )}
        </div>
      </section>

      <section style={{ padding: 'clamp(36px,5vw,56px) clamp(24px,5vw,72px) clamp(48px,6vw,72px)' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>

          {sections.length === 0 ? (
            <div style={{ background: NAVY, border: `1px solid ${GOLD}55`, borderRadius: '16px', padding: '28px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>{t('faq.none.title')}</h2>
              <p style={{ fontSize: '14px', lineHeight: 1.75, color: 'rgba(255,255,255,0.6)', margin: '0 0 16px' }}>{t('faq.none.body')}</p>
              {askButtons(t('faq.none.chat'), t('faq.none.email'), query)}
            </div>
          ) : sections.map(sec => (
            <div key={sec.id} style={{ marginBottom: '36px' }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: GOLD, margin: '0 0 14px' }}>
                {t('faq.cat.' + sec.id)}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sec.items.map(id => {
                  const isOpen = open === id || !!query
                  return (
                    <div key={id} style={{ background: NAVY, border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
                      <button
                        onClick={() => setOpen(isOpen && !query ? null : id)}
                        aria-expanded={isOpen}
                        style={{
                          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start',
                          justifyContent: 'space-between', gap: '14px', padding: '16px 18px',
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: '#fff', fontSize: '15px', fontWeight: 600, fontFamily: 'inherit', lineHeight: 1.5,
                        }}>
                        <span>{t('faq.q.' + id)}</span>
                        <span aria-hidden style={{ color: GOLD, fontSize: '18px', lineHeight: 1.2, flexShrink: 0, transform: isOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.15s' }}>+</span>
                      </button>
                      {isOpen && (
                        <p style={{ fontSize: '14px', lineHeight: 1.85, color: 'rgba(255,255,255,0.68)', margin: 0, padding: '0 18px 18px', maxWidth: '62ch' }}>
                          {t('faq.a.' + id)}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '16px', padding: '26px 28px', marginTop: '8px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>{t('faq.stillTitle')}</h2>
            <p style={{ fontSize: '14px', lineHeight: 1.75, color: 'rgba(255,255,255,0.6)', margin: '0 0 16px', maxWidth: '58ch' }}>{t('faq.stillBody')}</p>
            {askButtons(t('faq.stillChat'), t('faq.stillEmail'), '')}
          </div>

          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '28px' }}>
            <Link href={localePath('/assessment', locale)} style={{ color: GOLD, fontWeight: 700, textDecoration: 'none' }}>
              {t('assess.hero.cta')} →
            </Link>
          </p>
        </div>
      </section>

      {parentId && <ChatWidget parentId={parentId} seedInput={seed?.text} seedKey={seed?.n} />}
    </div>
  )
}
