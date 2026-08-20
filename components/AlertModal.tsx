'use client'

import { useEffect } from 'react'

// The house replacement for native alert(). alert() blocks the whole page, cannot
// be styled, and announces itself as the browser rather than as this app -- which
// is exactly wrong for "your action did not go through". Deep navy panel, one
// dismiss button, Escape and backdrop both close it.
//
// Admin-only for now: the caller passes copy that is already English. A
// parent-facing caller would have to hand it a translated string.
export default function AlertModal({
  message,
  onClose,
  title = 'Something went wrong',
}: {
  message: string | null
  onClose: () => void
  title?: string
}) {
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
      aria-label={title}
    >
      <div
        className="bg-[#111d38] border border-[#1e3a6e] rounded-2xl p-6 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-white font-bold text-lg mb-1">{title}</h3>
        <p className="text-gray-300 text-sm mb-5 leading-relaxed">{message}</p>
        <button
          onClick={onClose}
          autoFocus
          className="w-full py-2.5 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm hover:opacity-90 transition-all"
        >
          Close
        </button>
      </div>
    </div>
  )
}
