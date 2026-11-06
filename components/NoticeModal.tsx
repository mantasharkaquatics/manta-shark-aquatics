'use client'

import Sheet from '@/components/ui/Sheet'

// Something to read and close -- a booking cancelled, a payment back, a
// problem to know about. Pop-up kind ① (決定 9; 14-role test 2, J33: these
// were centred boxes with a big 關閉 at the foot): a sheet with its title
// and round ✕; pulling it down, a tap on the dim area, Esc and Android back
// close it too. An action that goes with it (e.g. 看課表) is passed in.
//
// Every string arrives already translated, so this file stays free of i18n. Pass
// message={null} to keep it closed. closeLabel is kept for callers; the ✕ is
// named by Sheet itself.
export default function NoticeModal({ title, message, onClose, action }: {
  title: string
  message: string | null
  closeLabel?: string
  onClose: () => void
  action?: { label: string; onClick: () => void }
}) {
  if (!message) return null
  return (
    <Sheet title={title} onClose={onClose} className="msa-notice">
      <p style={{ fontSize: 15, color: '#34435e', lineHeight: 1.65, margin: action ? '0 0 16px' : '0 0 6px', whiteSpace: 'pre-line' }}>{message}</p>
      {action && (
        <button type="button" onClick={() => { onClose(); action.onClick() }}
          style={{ width: '100%', minHeight: 48, borderRadius: 12, border: 'none', background: '#f09800', color: '#12254a', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          {action.label}
        </button>
      )}
    </Sheet>
  )
}
