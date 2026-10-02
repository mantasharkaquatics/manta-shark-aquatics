'use client'

import { useEffect } from 'react'
import { useT } from '@/lib/i18n/provider'

// The house replacement for native alert(). alert() blocks the whole page, cannot
// be styled, and announces itself as the browser rather than as this app -- which
// is exactly wrong for "your action did not go through". Deep navy panel, one
// dismiss button, Escape and backdrop both close it.
//
// The caller passes the message already in the reader's language; the default
// title and the Close button follow the surrounding LocaleProvider.
export default function AlertModal({
  message,
  onClose,
  title,
}: {
  message: string | null
  onClose: () => void
  title?: string
}) {
  const t = useT()
  const heading = title ?? t('common.noticeTitle')
  useEffect(() => {
    if (!message) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [message, onClose])

  if (!message) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
      onClick={onClose}
      role="alertdialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div
        className="bg-[#111d38] border border-[#1e3a6e] rounded-2xl p-6 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-white font-bold text-lg mb-1">{heading}</h3>
        <p className="text-gray-300 text-sm mb-5 leading-relaxed">{message}</p>
        <button
          onClick={onClose}
          autoFocus
          className="w-full py-2.5 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm hover:opacity-90 transition-all"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  )
}
