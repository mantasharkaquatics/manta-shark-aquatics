'use client'

import { useT } from '@/lib/i18n/provider'
import { openChat } from '@/lib/chat-open'

/* What a part of a page says when its data did not arrive (50-role test,
   2026-11-05): a failed read used to look like "nothing here" ("no times
   this day") or a spinner that never stopped, and families took it for a
   full schedule. Says so, offers to try again and a way to the desk. */
export default function LoadFailed({ onRetry, compact = false }: { onRetry: () => void; compact?: boolean }) {
  const t = useT()
  return (
    <div role="alert" style={{ padding: compact ? '8px 4px' : '16px 12px', textAlign: 'center', fontSize: 14, color: '#56647d', lineHeight: 1.6 }}>
      <p style={{ margin: '0 0 10px' }}>{t('load.failed')}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="tap-auto" onClick={onRetry}
          style={{ minHeight: 40, padding: '0 16px', borderRadius: 10, border: 0, background: '#f09800', color: '#12254a', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
          {t('load.retry')}
        </button>
        {!compact && (
          <button type="button" className="tap-auto" onClick={() => openChat()}
            style={{ minHeight: 40, padding: '0 16px', borderRadius: 10, border: '1px solid #d3deec', background: '#fff', color: '#12254a', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t('dash.up.messageUs')}
          </button>
        )}
      </div>
    </div>
  )
}
