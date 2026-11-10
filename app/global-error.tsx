'use client'

import { useEffect } from 'react'
import { reportClientError, isStaleCode, reloadForStaleCode } from '@/lib/report-client-error'

/* The last net: an error the page's own boundary (app/(public)/error.tsx)
   cannot catch -- one in a layout, such as the app's tab pager. Next's own
   page here was English and told the school nothing (owner, 2026-11-10).
   This one reports the error, reloads by itself when the page's code was
   replaced by a new deploy, and otherwise offers 重新載入. No provider is
   mounted at this level, so the words are fixed in both languages. */
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, 'global')
    if (isStaleCode(error)) reloadForStaleCode()
  }, [error])
  return (
    <html lang="zh-Hant">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#e9eff7', fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", sans-serif', padding: 20, boxSizing: 'border-box' }}>
        <div role="alert" style={{ maxWidth: 380, width: '100%', background: '#fff', border: '1px solid #e3ebf6', borderRadius: 18, padding: '28px 24px', textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={56} height={56} style={{ borderRadius: '50%', margin: '0 auto 12px', display: 'block' }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#12254a', margin: '0 0 6px' }}>畫面沒有載入成功</h1>
          <p style={{ fontSize: 14, color: '#56647d', margin: '0 0 4px' }}>Something went wrong loading this screen.</p>
          <p style={{ fontSize: 14, color: '#56647d', margin: '0 0 18px', lineHeight: 1.6 }}>我們已收到通知。請重新載入。</p>
          <button type="button" onClick={() => location.reload()}
            style={{ border: 0, borderRadius: 10, background: '#f09800', color: '#12254a', fontWeight: 800, fontSize: 15, padding: '12px 22px', cursor: 'pointer', fontFamily: 'inherit' }}>
            重新載入 · Reload
          </button>
        </div>
      </body>
    </html>
  )
}
