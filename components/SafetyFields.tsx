'use client'

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import { BRAND } from '@/lib/brand'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { contactProblem, formatPhone, MEDICAL_MAX, SUPPORT_MAX, CONTACT_NAME_MAX, RELATION_MAX, type EmergencyContact, type MedicalAnswer } from '@/lib/safety-info'

/* The safety questions (owner, 2026-10-22; lib/safety-info.ts), styled inline
   so the same fields sit in the register form, My Account and the dashboard. */

const S = {
  label: { display: 'block', fontSize: 14, color: BRAND.mute, marginBottom: 6 } as React.CSSProperties,
  input: { width: '100%', boxSizing: 'border-box', background: '#fff', border: '1px solid #d5e0ef', borderRadius: 8, padding: '10px 12px', fontSize: 16, color: '#16294a' } as React.CSSProperties,
  radioRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid #d5e0ef', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: '#16294a', background: '#fff' } as React.CSSProperties,
  hint: { fontSize: 12.5, color: BRAND.mute, lineHeight: 1.6, margin: '4px 0 0' } as React.CSSProperties,
  err: { fontSize: 13, color: '#c0392b', margin: '6px 0 0' } as React.CSSProperties,
}

/** "Does {name} have any medical conditions or allergies?" none / yes + text,
 *  then the optional learning / sensory needs (決定 7) under a line. */
export function MedicalQuestion({ id, name, value, onChange, invalid = false }: {
  id: string; name: string; value: MedicalAnswer | null; onChange: (v: MedicalAnswer) => void
  /** Saved without an answer: said beside the question and to a screen reader. */
  invalid?: boolean
}) {
  const t = useT()
  const has = value?.none === false
  // The needs answer rides along whatever happens to the medical one.
  const sup = value?.support !== undefined ? { support: value.support } : {}
  // Typing needs before the medical question keeps it unanswered.
  const setSupport = (v: string) => onChange(value ? { ...value, support: v } : { none: null, notes: '', support: v })
  return (
    <div>
      <p id={`${id}-q`} style={{ ...S.label, color: '#16294a', fontWeight: 600 }}>
        {name ? t('safety.medical.q', { name }) : t('safety.medical.qAnon')} <span style={{ color: '#c0392b', whiteSpace: 'nowrap' }} aria-hidden="true">*</span>
      </p>
      {/* The group is the two answers only, so the needs box below is not
          read as part of it (14-role test 2, J26). */}
      <div role="radiogroup" aria-labelledby={`${id}-q`} aria-required="true" aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-err` : undefined} style={{ display: 'grid', gap: 8 }}>
        <label style={{ ...S.radioRow, borderColor: value?.none ? BRAND.blue : '#d5e0ef' }}>
          <input type="radio" name={`${id}-med`} checked={value?.none === true} onChange={() => onChange({ ...sup, none: true, notes: '' })}
            style={{ width: 18, height: 18, accentColor: BRAND.blue }} />
          {t('safety.medical.none')}
        </label>
        <label style={{ ...S.radioRow, borderColor: has ? BRAND.blue : '#d5e0ef' }}>
          <input type="radio" name={`${id}-med`} checked={has} onChange={() => onChange({ ...sup, none: false, notes: value?.notes || '' })}
            style={{ width: 18, height: 18, accentColor: BRAND.blue }} />
          {t('safety.medical.has')}
        </label>
      </div>
      {invalid && <p id={`${id}-err`} role="alert" style={S.err}>{t('safety.err.medicalFor', { name: name || t('safety.medical.thisSwimmer') })}</p>}
      {has && (
        <div style={{ marginTop: 8 }}>
          <label htmlFor={`${id}-notes`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('safety.medical.has')}</label>
          <GrowArea id={`${id}-notes`} rows={3} max={MEDICAL_MAX} value={value?.notes || ''}
            onChange={v => onChange({ ...sup, none: false, notes: v })} placeholder={t('safety.medical.placeholder')} />
        </div>
      )}
      <div style={{ borderTop: '1px solid #e3eaf4', marginTop: 14, paddingTop: 12 }}>
        <label htmlFor={`${id}-support`} style={{ ...S.label, color: '#16294a', fontWeight: 600 }}>
          {name ? t('safety.support.q', { name }) : t('safety.support.qAnon')} <span style={{ color: BRAND.mute, fontWeight: 500, whiteSpace: 'nowrap' }}>{t('safety.support.optional')}</span>
        </label>
        <GrowArea id={`${id}-support`} rows={3} max={SUPPORT_MAX} value={value?.support || ''} describedBy={`${id}-support-h`}
          onChange={setSupport} placeholder={t('safety.support.placeholder')} />
        {/* Who reads it, beside the question itself (J83). */}
        <p id={`${id}-support-h`} style={S.hint}>{t('safety.support.hint')} {t('safety.whoShort')}</p>
      </div>
    </div>
  )
}

/* A text box that grows with what is typed -- and with its example while
   empty -- up to 240px, with a count once it nears its limit (14-role test 2,
   J32: two lines cut the example and the start of a long answer; J114: past
   the limit the end went unsaid). */
function GrowArea({ id, rows, max, value, onChange, placeholder, describedBy }: {
  id: string; rows: number; max: number; value: string; onChange: (v: string) => void; placeholder?: string; describedBy?: string
}) {
  const t = useT()
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight + 2, 240) + 'px'
  }, [value, placeholder])
  const near = value.length >= max * 0.9
  return (
    <>
      <textarea ref={ref} id={id} rows={rows} maxLength={max} value={value} onChange={e => onChange(e.target.value)}
        aria-describedby={[describedBy, near ? id + '-n' : ''].filter(Boolean).join(' ') || undefined}
        placeholder={placeholder} style={{ ...S.input, resize: 'vertical', lineHeight: 1.5, overflowY: 'auto' }} />
      {near && <p id={id + '-n'} style={{ ...S.hint, color: value.length >= max ? '#a36100' : BRAND.mute }}>
        {value.length >= max ? t('safety.charLimit', { max }) : t('safety.charCount', { n: value.length, max })}</p>}
    </>
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
          <label htmlFor={`${id}-name`} style={S.label}>{t('safety.contact.name')} <span style={{ color: '#c0392b' }} aria-hidden="true">*</span></label>
          <input id={`${id}-name`} style={S.input} value={value.name} maxLength={CONTACT_NAME_MAX} autoComplete="off"
            onChange={e => onChange({ ...value, name: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-rel`} style={S.label}>{t('safety.contact.relation')} <span style={{ color: '#c0392b' }} aria-hidden="true">*</span></label>
          <input id={`${id}-rel`} style={S.input} value={value.relation} maxLength={RELATION_MAX} autoComplete="off"
            placeholder={t('safety.contact.relationPh')} onChange={e => onChange({ ...value, relation: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-phone`} style={S.label}>{t('safety.contact.phone')} <span style={{ color: '#c0392b' }} aria-hidden="true">*</span></label>
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
    case 'TOO_LONG': return 'safety.err.tooLong'
    default: return 'safety.err.save'
  }
}

type Info = {
  contact: EmergencyContact | null
  students: { id: string; full_name: string; medical_notes: string | null; support_notes?: string | null; answered: boolean }[]
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
  // Closing with changes asks first (14-role test 2, J03: a tap on the dim
  // area, Esc or the back button threw away everything typed).
  const initial = useRef('')
  const [asking, setAsking] = useState(false)
  const dirty = () => !!info && initial.current !== JSON.stringify({ answers, contact })
  const requestClose = () => { if (saving) return; if (dirty()) setAsking(true); else onClose() }
  const box = useDialogFocus<HTMLDivElement>(true, () => { if (!asking) requestClose() })

  useEffect(() => {
    let live = true
    fetch('/api/parent/safety', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((d: Info | null) => {
      if (!live) return
      if (!d) { setLoadErr(true); return }
      setInfo(d)
      const a0 = Object.fromEntries(d.students.map(s => [s.id, s.answered ? { none: !s.medical_notes, notes: s.medical_notes || '', support: s.support_notes || '' } : (s.support_notes ? { none: null, notes: '', support: s.support_notes } : null)]))
      const c0 = d.contact ? { name: d.contact.name, relation: d.contact.relation, phone: formatPhone(d.contact.phone) } : { name: '', relation: '', phone: '' }
      initial.current = JSON.stringify({ answers: a0, contact: c0 })
      setAnswers(a0); setContact(c0)
    }).catch(() => { if (live) setLoadErr(true) })
    return () => { live = false }
  }, [])

  const [missingId, setMissingId] = useState<string | null>(null)
  async function save() {
    if (!info) return
    setErr(null)
    const missingAnswer = info.students.find(s => { const a = answers[s.id]; return !a || (!a.none && !a.notes.trim()) })
    if (missingAnswer) {
      setErr(t('safety.err.medicalFor', { name: missingAnswer.full_name }))
      // Taken to that child's question, marked (2026-11-04: the note was at
      // the bottom and the question off screen above).
      setMissingId(missingAnswer.id)
      // Focus on that child's first answer, which also brings it into view.
      document.querySelector<HTMLInputElement>(`#safety-kid-${missingAnswer.id} input[type=radio]`)?.focus()
      return
    }
    setMissingId(null)
    const p = contactProblem(contact, parentPhone)
    if (p) {
      setErr(t(safetyErrorKey(p)))
      document.getElementById(p === 'name' ? 'sf-contact-name' : p === 'relation' ? 'sf-contact-rel' : 'sf-contact-phone')?.focus()
      return
    }
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

  // Pop-up kind ① (決定 9; J03): a sheet with its title, the who-sees line
  // and ✕ on top, Save fixed at the foot so a small phone always shows it.
  return (
    <>
    <div className="msa-sheet-back" onClick={requestClose}>
      <div ref={box} className="msa-sheet" role="dialog" aria-modal="true" aria-labelledby="safety-title" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 560, paddingBottom: 0 }}>
        <div className="msa-sheet-head" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="safety-title" style={{ fontSize: 19, fontWeight: 800, color: BRAND.navy }}>{t('safety.modal.title')}</h2>
            <p style={{ ...S.hint, marginTop: 2 }}>{t('safety.who')}</p>
          </div>
          <button type="button" onClick={requestClose} disabled={saving} aria-label={t('common.close')}
            className="msa-sheet-x tap-auto"><span aria-hidden="true">✕</span></button>
        </div>

        {loadErr ? <p style={S.err}>{t('safety.err.load')}</p> : !info ? <p style={S.hint}>{t('common.loading')}</p> : (
          <div style={{ display: 'grid', gap: 16 }}>
            {info.students.map(s => (
              <div key={s.id} id={'safety-kid-' + s.id} style={{ background: '#fff', border: missingId === s.id ? '2px solid #c0392b' : '1px solid #e3eaf4', borderRadius: 12, padding: 14, scrollMarginTop: 90 }}>
                <MedicalQuestion id={`sf-${s.id}`} name={s.full_name} value={answers[s.id] ?? null} invalid={missingId === s.id}
                  onChange={v => { setAnswers(a => ({ ...a, [s.id]: v })); if (missingId === s.id) setMissingId(null) }} />
              </div>
            ))}
            <div style={{ background: '#fff', border: '1px solid #e3eaf4', borderRadius: 12, padding: 14 }}>
              <EmergencyContactFields id="sf-contact" value={contact} onChange={setContact} />
            </div>
            <div style={{ position: 'sticky', bottom: 0, background: '#f6f9fd', margin: '0 -20px', padding: '12px 20px calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid #e3eaf4' }}>
              {err && <p role="alert" style={{ ...S.err, margin: '0 0 8px' }}>{err}</p>}
              <button type="button" onClick={save} disabled={saving}
                style={{ width: '100%', minHeight: 48, padding: '12px', borderRadius: 10, border: 'none', background: BRAND.amber, color: BRAND.navy, fontWeight: 800, fontSize: 15, cursor: 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>
                {saving ? t('safety.saving') : t('safety.save')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    {/* Beside the sheet, not in it: a tap on its dim area must not reach the sheet's. */}
    {asking && (
      <ConfirmDialog id="safety-discard" title={t('safety.discard.title')} noLabel={t('safety.discard.keep')} yesLabel={t('safety.discard.yes')} danger
        onNo={() => setAsking(false)} onYes={() => { setAsking(false); onClose() }}>{t('safety.discard.body')}</ConfirmDialog>
    )}
    </>
  )
}
