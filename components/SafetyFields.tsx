'use client'

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import { BRAND } from '@/lib/brand'
import { contactProblem, formatPhone, MEDICAL_MAX, CONTACT_NAME_MAX, RELATION_MAX, type EmergencyContact, type MedicalAnswer } from '@/lib/safety-info'

/* The safety questions (owner, 2026-10-22; lib/safety-info.ts), styled inline
   so the same fields sit in the register form, My Account and the dashboard. */

const S = {
  label: { display: 'block', fontSize: 14, color: BRAND.mute, marginBottom: 6 } as React.CSSProperties,
  input: { width: '100%', boxSizing: 'border-box', background: '#fff', border: '1px solid #d5e0ef', borderRadius: 8, padding: '10px 12px', fontSize: 16, color: '#16294a' } as React.CSSProperties,
  radioRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid #d5e0ef', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: '#16294a', background: '#fff' } as React.CSSProperties,
  hint: { fontSize: 12.5, color: BRAND.mute, lineHeight: 1.6, margin: '4px 0 0' } as React.CSSProperties,
  err: { fontSize: 13, color: '#c0392b', margin: '6px 0 0' } as React.CSSProperties,
}

/** "Does {name} have any medical conditions or allergies?" none / yes + text. */
export function MedicalQuestion({ id, name, value, onChange }: {
  id: string; name: string; value: MedicalAnswer | null; onChange: (v: MedicalAnswer) => void
}) {
  const t = useT()
  const has = value ? !value.none : false
  return (
    <div role="radiogroup" aria-labelledby={`${id}-q`}>
      <p id={`${id}-q`} style={{ ...S.label, color: '#16294a', fontWeight: 600 }}>
        {t('safety.medical.q', { name: name || t('safety.medical.thisSwimmer') })} <span style={{ color: '#c0392b' }} aria-hidden="true">*</span>
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        <label style={{ ...S.radioRow, borderColor: value?.none ? BRAND.blue : '#d5e0ef' }}>
          <input type="radio" name={`${id}-med`} checked={value?.none === true} onChange={() => onChange({ none: true, notes: '' })}
            style={{ width: 18, height: 18, accentColor: BRAND.blue }} />
          {t('safety.medical.none')}
        </label>
        <label style={{ ...S.radioRow, borderColor: has ? BRAND.blue : '#d5e0ef' }}>
          <input type="radio" name={`${id}-med`} checked={has} onChange={() => onChange({ none: false, notes: value?.notes || '' })}
            style={{ width: 18, height: 18, accentColor: BRAND.blue }} />
          {t('safety.medical.has')}
        </label>
      </div>
      {has && (
        <div style={{ marginTop: 8 }}>
          <label htmlFor={`${id}-notes`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('safety.medical.has')}</label>
          <textarea id={`${id}-notes`} rows={3} maxLength={MEDICAL_MAX} value={value?.notes || ''}
            onChange={e => onChange({ none: false, notes: e.target.value })}
            placeholder={t('safety.medical.placeholder')} style={{ ...S.input, resize: 'vertical', lineHeight: 1.5 }} />
        </div>
      )}
    </div>
  )
}

/** One emergency contact: name, relationship, phone. */
export function EmergencyContactFields({ id, value, onChange }: {
  id: string; value: EmergencyContact; onChange: (v: EmergencyContact) => void
}) {
  const t = useT()
  return (
    <div role="group" aria-labelledby={`${id}-t`}>
      <p id={`${id}-t`} style={{ ...S.label, color: '#16294a', fontWeight: 600, marginBottom: 2 }}>
        {t('safety.contact.title')} <span style={{ color: '#c0392b' }} aria-hidden="true">*</span>
      </p>
      <p style={{ ...S.hint, margin: '0 0 10px' }}>{t('safety.contact.hint')}</p>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div>
          <label htmlFor={`${id}-name`} style={S.label}>{t('safety.contact.name')}</label>
          <input id={`${id}-name`} style={S.input} value={value.name} maxLength={CONTACT_NAME_MAX} autoComplete="off"
            onChange={e => onChange({ ...value, name: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-rel`} style={S.label}>{t('safety.contact.relation')}</label>
          <input id={`${id}-rel`} style={S.input} value={value.relation} maxLength={RELATION_MAX} autoComplete="off"
            placeholder={t('safety.contact.relationPh')} onChange={e => onChange({ ...value, relation: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-phone`} style={S.label}>{t('safety.contact.phone')}</label>
          <input id={`${id}-phone`} style={S.input} value={value.phone} type="tel" inputMode="tel" autoComplete="off"
            placeholder="(714) 555-0123" onChange={e => onChange({ ...value, phone: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

/** The words for a contactProblem() answer, or a missing medical answer. */
export function safetyErrorKey(code: string | null | undefined): string {
  switch (code) {
    case 'name': case 'CONTACT_NAME': return 'safety.err.name'
    case 'relation': case 'CONTACT_RELATION': return 'safety.err.relation'
    case 'phone': case 'CONTACT_PHONE': return 'safety.err.phone'
    case 'same_as_parent': case 'CONTACT_SAME_AS_PARENT': return 'safety.err.same'
    case 'MEDICAL': return 'safety.err.medical'
    default: return 'safety.err.save'
  }
}

type Info = {
  contact: EmergencyContact | null
  students: { id: string; full_name: string; medical_notes: string | null; answered: boolean }[]
  missing: boolean
}

/**
 * The whole form in a dialog: every swimmer's medical answer and the family's
 * emergency contact, loaded from and saved to /api/parent/safety.
 */
export function SafetyEditor({ parentPhone, onClose, onSaved }: { parentPhone?: string | null; onClose: () => void; onSaved?: (missing: boolean) => void }) {
  const t = useT()
  const [info, setInfo] = useState<Info | null>(null)
  const [loadErr, setLoadErr] = useState(false)
  const [answers, setAnswers] = useState<Record<string, MedicalAnswer | null>>({})
  const [contact, setContact] = useState<EmergencyContact>({ name: '', relation: '', phone: '' })
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    fetch('/api/parent/safety', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((d: Info | null) => {
      if (!live) return
      if (!d) { setLoadErr(true); return }
      setInfo(d)
      setAnswers(Object.fromEntries(d.students.map(s => [s.id, s.answered ? { none: !s.medical_notes, notes: s.medical_notes || '' } : null])))
      if (d.contact) setContact({ name: d.contact.name, relation: d.contact.relation, phone: formatPhone(d.contact.phone) })
    }).catch(() => { if (live) setLoadErr(true) })
    return () => { live = false }
  }, [])
  useEffect(() => { box.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  async function save() {
    if (!info) return
    setErr(null)
    const missingAnswer = info.students.find(s => { const a = answers[s.id]; return !a || (!a.none && !a.notes.trim()) })
    if (missingAnswer) { setErr(t('safety.err.medicalFor', { name: missingAnswer.full_name })); return }
    const p = contactProblem(contact, parentPhone)
    if (p) { setErr(t(safetyErrorKey(p))); return }
    setSaving(true)
    const res = await fetch('/api/parent/safety', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact, students: info.students.map(s => ({ id: s.id, ...answers[s.id] })) }),
    }).catch(() => null)
    const d = res ? await res.json().catch(() => null) : null
    setSaving(false)
    if (!res || !res.ok) { setErr(t(safetyErrorKey(d?.code))); return }
    onSaved?.(!!d?.missing)
    onClose()
  }

  return (
    <div onClick={() => !saving && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,20,40,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto' }}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="safety-title" onClick={e => e.stopPropagation()}
        style={{ background: '#f7faff', borderRadius: 16, width: '100%', maxWidth: 560, padding: '22px 20px', boxShadow: '0 20px 60px rgba(10,20,40,0.3)', outline: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 id="safety-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: BRAND.navy }}>{t('safety.modal.title')}</h2>
            <p style={{ ...S.hint, marginTop: 4 }}>{t('safety.who')}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label={t('common.close')}
            className="tap-auto" style={{ background: '#e9eff7', border: 'none', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', fontSize: 16, color: BRAND.navy }}>✕</button>
        </div>

        {loadErr ? <p style={S.err}>{t('safety.err.load')}</p> : !info ? <p style={S.hint}>{t('common.loading')}</p> : (
          <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
            {info.students.map(s => (
              <div key={s.id} style={{ background: '#fff', border: '1px solid #e3eaf4', borderRadius: 12, padding: 14 }}>
                <MedicalQuestion id={`sf-${s.id}`} name={s.full_name} value={answers[s.id] ?? null}
                  onChange={v => setAnswers(a => ({ ...a, [s.id]: v }))} />
              </div>
            ))}
            <div style={{ background: '#fff', border: '1px solid #e3eaf4', borderRadius: 12, padding: 14 }}>
              <EmergencyContactFields id="sf-contact" value={contact} onChange={setContact} />
            </div>
            {err && <p role="alert" style={{ ...S.err, marginTop: 0 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={onClose} disabled={saving}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #d5e0ef', background: '#fff', color: BRAND.navy, fontWeight: 700, cursor: 'pointer' }}>
                {t('common.cancel')}
              </button>
              <button type="button" onClick={save} disabled={saving}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: BRAND.amber, color: BRAND.navy, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? t('safety.saving') : t('safety.save')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
