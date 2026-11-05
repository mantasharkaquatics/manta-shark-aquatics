'use client'

import { useT } from '@/lib/i18n/provider'
import { useDialogFocus } from '@/lib/use-dialog-focus'

/* Pop-up kind ① (owner, 2026-11-05, 決定 9 選項 A): something to look at.
   The dim area, the sheet, its head with the title and a round ✕. On a
   phone it rises from the bottom with a grab bar, and pulling the head
   down closes it (components/SheetSwipe); a tap on the dim area, Esc and
   the Android back button close it too. Styles: app/globals.css. */
export default function Sheet({ title, label, onClose, children, className, headExtra }: {
  title?: React.ReactNode
  /** The accessible name when the title is not plain text. */
  label?: string
  onClose: () => void
  children: React.ReactNode
  className?: string
  /** Something beside the title (a small link or badge). */
  headExtra?: React.ReactNode
}) {
  const t = useT()
  const box = useDialogFocus(true, onClose)
  return (
    <div className="msa-sheet-back" onClick={onClose}>
      <div ref={box} className={'msa-sheet' + (className ? ' ' + className : '')} onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={label || (typeof title === 'string' ? title : undefined)}>
        <div className="msa-sheet-head">
          <b>{title}</b>
          {headExtra}
          <button type="button" className="msa-sheet-x tap-auto" onClick={onClose} aria-label={t('common.close')}><span aria-hidden="true">✕</span></button>
        </div>
        {children}
      </div>
    </div>
  )
}
