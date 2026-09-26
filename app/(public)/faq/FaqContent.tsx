'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { createClient } from '@/lib/supabase/client'
import ChatWidget from '@/components/ChatWidget'
import { FAQ } from '@/lib/faq'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'

const EMAIL = 'info@mantasharkaquatics.net'

// Palette B (2026-09): dark top, the questions as white cards on the pale
// blue, and a topic list that looks like what it is -- a menu you press. On a
// computer it is the same white card as the level list on /levels, with the
// topic you are reading in navy; on a phone it is a row of buttons above the
// questions. (The search box was taken out at the owner's request, 2026-09-25.)
const css = `
  .f-grid { display: grid; grid-template-columns: 250px 1fr; gap: 32px; align-items: start; }
  .f-nav { position: sticky; top: calc(var(--nav-cover, 76px) + 20px); transition: top .28s ease; background: #fff; border: 1px solid ${BRAND.line}; border-radius: 18px; padding: 10px;
           display: flex; flex-direction: column; gap: 4px; }
  .f-nav a { display: flex; align-items: center; gap: 10px; padding: 12px 12px; border-radius: 12px; font-size: 14.5px; font-weight: 700;
             color: ${BRAND.ink}; text-decoration: none; transition: background 0.15s; }
  .f-nav a:hover { background: ${BRAND.paper}; }
  .f-nav a span { flex: 1; min-width: 0; }
  .f-nav a i { font-style: normal; color: #b8c4d6; font-size: 16px; }
  .f-nav a[aria-current="true"] { background: ${BRAND.navy}; color: #fff; }
  .f-nav a[aria-current="true"] i { color: ${BRAND.yellow}; }
  .f-nav a:focus-visible, .f-chips a:focus-visible { outline: 3px solid ${BRAND.yellow}; outline-offset: 2px; }

  .f-chips { display: none; flex-wrap: wrap; gap: 8px; margin-bottom: 28px; }
  .f-chips a { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #c9d8ee; border-radius: 999px;
               padding: 9px 14px; font-size: 14px; font-weight: 700; color: ${BRAND.blue}; text-decoration: none; }
  .f-chips a::after { content: '↓'; font-size: 13px; }

  .f-sec { scroll-margin-top: 110px; }
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

  @media (max-width: 900px) {
    .f-grid { grid-template-columns: 1fr; gap: 0; }
    .f-nav { display: none; }
    .f-chips { display: flex; }
    .f-item button { font-size: 15px; padding: 16px; }
    .f-item p { padding: 0 16px 18px; }
  }
`

export default function FaqContent() {
  const t = useT()
  const locale = useLocale()
  const [open, setOpen] = useState<string | null>(null)
  const [current, setCurrent] = useState<string>(FAQ[0].id)
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

  // Keep the topic list pointing at the section being read, so it is plain
  // that the list moves you around the page.
  useEffect(() => {
    const els = FAQ.map(c => document.getElementById('faq-' + c.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(entries => {
      const hit = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (hit) setCurrent(hit.target.id.replace('faq-', ''))
    }, { rootMargin: '-100px 0px -60% 0px' })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  const askButton = parentId
    ? <button type="button" className="b-btn gold" onClick={() => setSeed({ text: '', n: (seed?.n ?? 0) + 1 })}>{t('faq.stillChat')}</button>
    : <a className="b-btn gold" href={`mailto:${EMAIL}`}>{t('faq.stillEmail')}</a>

  return (
    <BrandRoot>
      <style>{css}</style>

      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">{t('faq.hero.eyebrow')}</p>
          <h1>{t('faq.hero.title')}</h1>
          <p className="b-lead">{t('faq.hero.sub')}</p>
        </div>
      </header>

      <section className="b-sec b-paper" style={{ paddingTop: 56 }}>
        <div className="b-wrap f-grid">
          <nav className="f-nav" aria-label={t('faq.hero.eyebrow')}>
            {FAQ.map(cat => (
              <a key={cat.id} href={'#faq-' + cat.id} aria-current={current === cat.id} onClick={() => setCurrent(cat.id)}>
                <span>{t('faq.cat.' + cat.id)}</span>
                <i aria-hidden="true">›</i>
              </a>
            ))}
          </nav>

          <div>
            <div className="f-chips">
              {FAQ.map(cat => <a key={cat.id} href={'#faq-' + cat.id}>{t('faq.cat.' + cat.id)}</a>)}
            </div>

            {FAQ.map(sec => (
              <div key={sec.id} id={'faq-' + sec.id} className="f-sec">
                <h2>{t('faq.cat.' + sec.id)}</h2>
                <div className="f-list">
                  {sec.items.map(id => {
                    const isOpen = open === id
                    return (
                      <div key={id} className="f-item" data-open={isOpen}>
                        <button type="button" onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen}>
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
            {askButton}
            <Link href={localePath('/assessment', locale)} className="b-btn ghost">{t('assess.hero.cta')} →</Link>
          </div>
        </div>
      </section>

      {parentId && <ChatWidget parentId={parentId} seedInput={seed?.text} seedKey={seed?.n} />}
    </BrandRoot>
  )
}
