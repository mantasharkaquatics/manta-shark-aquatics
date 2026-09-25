'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { createClient } from '@/lib/supabase/client'
import ChatWidget from '@/components/ChatWidget'
import { FAQ } from '@/lib/faq'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'

const EMAIL = 'info@mantasharkaquatics.net'

/** Fold case and strip the punctuation that differs between how a parent types
 *  a question and how we wrote it, so "24小時" finds "24 小時". CJK has no word
 *  boundaries, so this is substring matching on purpose. */
function normalise(s: string) {
  return s.toLowerCase().replace(/[\s·、，,。.？?！!—–\-()（）「」“”"']/g, '')
}

// Palette B (2026-09): dark top with the search box, the questions as white
// cards on the pale blue, a topic list beside them on a computer.
const css = `
  .f-search { position: relative; max-width: 520px; margin-top: 26px; }
  .f-search svg { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: ${BRAND.mute}; pointer-events: none; }
  .f-search input { width: 100%; box-sizing: border-box; padding: 15px 16px 15px 46px; border-radius: 12px; border: 0;
    background: #fff; color: ${BRAND.ink}; font-size: 15px; font-family: inherit; box-shadow: 0 10px 30px rgba(0,0,0,0.18); }
  .f-search input:focus { outline: 3px solid ${BRAND.yellow}; outline-offset: 2px; }
  .f-search input.has { padding-right: 72px; }
  .f-search button { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: transparent; border: 0;
    color: ${BRAND.blue}; font-size: 13px; font-weight: 700; cursor: pointer; padding: 6px 8px; font-family: inherit; }
  .f-count { font-size: 13px; color: rgba(255,255,255,0.65); margin: 12px 0 0; }

  .f-grid { display: grid; grid-template-columns: 220px 1fr; gap: 40px; align-items: start; }
  .f-nav { position: sticky; top: 96px; display: flex; flex-direction: column; gap: 2px; }
  .f-nav a { display: block; padding: 9px 12px; border-radius: 10px; font-size: 14px; font-weight: 700; color: ${BRAND.mute}; text-decoration: none; }
  .f-nav a:hover { background: #fff; color: ${BRAND.navy}; }
  .f-sec { scroll-margin-top: 96px; }
  .f-sec + .f-sec { margin-top: 40px; }
  .f-sec h2 { font-size: 22px; font-weight: 800; color: ${BRAND.navy}; margin-bottom: 14px; }
  .f-list { display: flex; flex-direction: column; gap: 8px; }
  .f-item { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden; }
  .f-item[data-open="true"] { border-color: #c9d8ee; box-shadow: 0 6px 20px rgba(18,37,74,0.06); }
  .f-item button { width: 100%; text-align: left; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    padding: 18px 20px; background: transparent; border: 0; cursor: pointer; color: ${BRAND.ink}; font-size: 16px; font-weight: 700;
    font-family: inherit; line-height: 1.5; }
  .f-item button:focus-visible { outline: 3px solid ${BRAND.yellow}; outline-offset: -3px; }
  .f-plus { width: 26px; height: 26px; border-radius: 50%; background: ${BRAND.paper}; color: ${BRAND.blue}; display: grid; place-items: center;
    flex-shrink: 0; font-size: 18px; line-height: 1; transition: transform 0.15s, background 0.15s; }
  .f-item[data-open="true"] .f-plus { transform: rotate(45deg); background: ${BRAND.navy}; color: #fff; }
  .f-item p { font-size: 15px; line-height: 1.8; color: ${BRAND.mute}; margin: 0; padding: 0 20px 20px; max-width: 64ch; }

  .f-none { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 16px; padding: 28px; }
  .f-none h2 { font-size: 20px; color: ${BRAND.navy}; margin-bottom: 8px; }
  .f-none p { color: ${BRAND.mute}; font-size: 15px; line-height: 1.7; margin: 0 0 18px; }

  @media (max-width: 900px) {
    .f-grid { grid-template-columns: 1fr; gap: 0; }
    .f-nav { display: none; }
    .f-item button { font-size: 15px; padding: 16px; }
    .f-item p { padding: 0 16px 18px; }
  }
`

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
    if (parentId) setSeed({ text, n: (seed?.n ?? 0) + 1 })
    else window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(text || 'Question')}`
  }

  const askButton = (labelChat: string, labelEmail: string, text: string) => parentId
    ? <button type="button" className="b-btn gold" onClick={() => askUs(text)}>{labelChat}</button>
    : <a className="b-btn gold" href={`mailto:${EMAIL}${text ? '?subject=' + encodeURIComponent(text) : ''}`}>{labelEmail}</a>

  return (
    <BrandRoot>
      <style>{css}</style>

      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">{t('faq.hero.eyebrow')}</p>
          <h1>{t('faq.hero.title')}</h1>
          <p className="b-lead">{t('faq.hero.sub')}</p>
          <div className="f-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="text"
              inputMode="search"
              className={query ? 'has' : ''}
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(null) }}
              placeholder={t('faq.search.placeholder')}
              aria-label={t('faq.search.placeholder')}
            />
            {query && <button type="button" onClick={() => setQuery('')}>{t('faq.search.clear')}</button>}
          </div>
          {query && (
            <p className="f-count" aria-live="polite">
              {matchCount === 1 ? t('faq.search.countOne') : t('faq.search.count', { n: matchCount })}
            </p>
          )}
        </div>
      </header>

      <section className="b-sec b-paper" style={{ paddingTop: 56 }}>
        <div className="b-wrap f-grid">
          {/* Topics, for jumping. Hidden while searching: the list below is
              then only the matches, and most topics would point at nothing. */}
          <nav className="f-nav" aria-label={t('faq.hero.eyebrow')} style={query ? { visibility: 'hidden' } : undefined}>
            {FAQ.map(cat => <a key={cat.id} href={'#faq-' + cat.id}>{t('faq.cat.' + cat.id)}</a>)}
          </nav>

          <div>
            {sections.length === 0 ? (
              <div className="f-none">
                <h2>{t('faq.none.title')}</h2>
                <p>{t('faq.none.body')}</p>
                {askButton(t('faq.none.chat'), t('faq.none.email'), query)}
              </div>
            ) : sections.map(sec => (
              <div key={sec.id} id={'faq-' + sec.id} className="f-sec">
                <h2>{t('faq.cat.' + sec.id)}</h2>
                <div className="f-list">
                  {sec.items.map(id => {
                    const isOpen = open === id || !!query
                    return (
                      <div key={id} className="f-item" data-open={isOpen}>
                        <button type="button" onClick={() => setOpen(isOpen && !query ? null : id)} aria-expanded={isOpen}>
                          <span>{t('faq.q.' + id)}</span>
                          <span className="f-plus" aria-hidden="true">+</span>
                        </button>
                        {isOpen && <p>{t('faq.a.' + id)}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="b-final">
        <div className="b-wrap">
          <h2>{t('faq.stillTitle')}</h2>
          <p>{t('faq.stillBody')}</p>
          <div className="b-ctas">
            {askButton(t('faq.stillChat'), t('faq.stillEmail'), '')}
            <Link href={localePath('/assessment', locale)} className="b-btn ghost">{t('assess.hero.cta')} →</Link>
          </div>
        </div>
      </section>

      {parentId && <ChatWidget parentId={parentId} seedInput={seed?.text} seedKey={seed?.n} />}
    </BrandRoot>
  )
}
