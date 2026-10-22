'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import { formatPhone } from '@/lib/safety-info'

type Info = {
  contact: { name: string; relation: string; phone: string } | null
  students: { id: string; full_name: string; medical_notes: string | null; answered: boolean }[]
  missing: boolean
}

/** Members: a family's medical answers and emergency contact (owner,
 *  2026-10-22). Read-only here; the family keeps it up to date. */
export default function AdminSafetyInfo({ parentId }: { parentId: string }) {
  const t = useT()
  const [info, setInfo] = useState<Info | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    fetch('/api/admin/safety?parent_id=' + parentId, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (live) { if (d) setInfo(d); else setFailed(true) } })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [parentId])
  if (failed) return <p className="text-red-400 text-xs">{t('admin.safety.loadFailed')}</p>
  if (!info) return null
  return (
    <div className="border-t border-[#1e3a6e]/40 pt-4">
      <p className="text-gray-500 text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
        {t('admin.safety.title')}
        {info.missing && <span className="normal-case tracking-normal text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/40">{t('admin.safety.missing')}</span>}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {info.students.map(s => (
          <div key={s.id} className={`rounded-lg px-3 py-2 text-sm border ${s.medical_notes ? 'bg-red-500/10 border-red-400/40' : 'bg-[#0d1529] border-[#1e3a6e]'}`}>
            <p className="text-white font-medium">{s.full_name}</p>
            <p className={`whitespace-pre-wrap ${s.medical_notes ? 'text-red-200' : 'text-gray-400'}`}>
              {!s.answered ? t('admin.safety.notAnswered') : s.medical_notes || t('admin.safety.none')}
            </p>
          </div>
        ))}
        <div className="rounded-lg px-3 py-2 text-sm border bg-[#0d1529] border-[#1e3a6e]">
          <p className="text-white font-medium">{t('admin.safety.contact')}</p>
          {info.contact ? (
            <p className="text-gray-300">
              {info.contact.name}{info.contact.relation ? ` (${info.contact.relation})` : ''} ·{' '}
              <a className="text-[#c9a84c] underline" href={`tel:${info.contact.phone}`}>{formatPhone(info.contact.phone)}</a>
            </p>
          ) : <p className="text-gray-400">{t('admin.safety.notAnswered')}</p>}
        </div>
      </div>
    </div>
  )
}
