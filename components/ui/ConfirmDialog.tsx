'use client'

import { useT } from '@/lib/i18n/provider'
import { useDialogFocus } from '@/lib/use-dialog-focus'

/* Pop-up kind ② (owner, 2026-11-05, 決定 9 選項 A): a decision. Centred;
   the way out on the left, the action on the right; a tap on the dim area,
   Esc and the Android back button are the way out. Styles: app/globals.css
   (.msa-dlg-*). Pages with a dialog of their own shape use those classes. */
export default function ConfirmDialog({ eyebrow, title, children, noLabel, yesLabel, onNo, onYes, danger, busy, yesDisabled, id = 'msa-dlg' }: {
  eyebrow?: string
  title: React.ReactNode
  children?: React.ReactNode
  noLabel?: string
  /** No action button: an information dialog with only the way out. */
  yesLabel?: string
  onNo: () => void
  onYes?: () => void
  danger?: boolean
  busy?: boolean
  yesDisabled?: boolean
  id?: string
}) {
  const t = useT()
  const box = useDialogFocus(true, busy ? undefined : onNo)
  return (
    <div className="msa-dlg-back" onClick={() => !busy && onNo()}>
      <div ref={box} className="msa-dlg" role="dialog" aria-modal="true" aria-labelledby={id + '-t'} onClick={e => e.stopPropagation()}>
        {eyebrow && <div className="msa-dlg-eyebrow">{eyebrow}</div>}
        <h2 id={id + '-t'} className="msa-dlg-title">{title}</h2>
        {children && <div className="msa-dlg-body">{children}</div>}
        <div className="msa-dlg-acts">
          <button type="button" className="msa-dlg-no" onClick={onNo} disabled={busy}>{noLabel || t(yesLabel ? 'common.no' : 'common.close')}</button>
          {yesLabel && onYes && (
            <button type="button" className={'msa-dlg-yes' + (danger ? ' danger' : '')} onClick={onYes} disabled={busy || yesDisabled}>{yesLabel}</button>
          )}
        </div>
      </div>
    </div>
  )
}
