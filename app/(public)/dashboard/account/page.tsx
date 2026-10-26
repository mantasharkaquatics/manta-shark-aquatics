'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT, useLocale } from '@/lib/i18n/provider'
import { errorKey } from '@/lib/i18n/errors'
import { ACCT_CSS } from '@/components/brand/AcctStyles'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import { isAdultOn, missingHolderColumn } from '@/lib/account-holder'
import { MedicalQuestion, SafetyEditor } from '@/components/SafetyFields'
import ContactChange from '@/components/ContactChange'
import GuardianSection from '@/components/GuardianSection'
import AccountPrivacy from '@/components/AccountPrivacy'
import { formatPhone, medicalToStore, type MedicalAnswer } from '@/lib/safety-info'
import { myParentId, myFamilyRole } from '@/lib/my-parent'

interface Parent {
  id: string; auth_user_id?: string | null; first_name: string; last_name: string; email: string; phone: string
  registered_at: string | null; newsletter_subscribed: boolean; preferred_language: string
}
interface Student { id: string; full_name: string; date_of_birth: string | null; added_by_parent?: boolean; is_account_holder?: boolean }

const INTL_LOCALE: Record<string, string> = { en: 'en-US', 'zh-Hant': 'zh-TW', 'zh-Hans': 'zh-CN' }
const todayLA = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

export default function AccountPage() {
  const t = useT()
  const locale = useLocale()
  const supabase = createClient()
  const router = useRouter()
  const [parent, setParent] = useState<Parent | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [newsletterSaving, setNewsletterSaving] = useState(false)
  const [newsletterError, setNewsletterError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDob, setNewDob] = useState('')
  // "This swimmer is me" (F15): offered for an adult only; the server makes
  // this swimmer the family's one account holder and clears the others.
  const [newMe, setNewMe] = useState(false)
  // The new swimmer's answer to the safety question (owner, 2026-10-22).
  const [newMedical, setNewMedical] = useState<MedicalAnswer | null>(null)
  // What is on file for the family's safety (lib/safety-info.ts).
  type Safety = { contact: { name: string; relation: string; phone: string } | null; students: { id: string; full_name: string; medical_notes: string | null; answered: boolean }[]; missing: boolean }
  const [safety, setSafety] = useState<Safety | null>(null)
  const [safetyOpen, setSafetyOpen] = useState(false)
  // Changing their own email or phone (owner, 2026-10-22).
  const [contactEdit, setContactEdit] = useState<'email' | 'phone' | null>(null)
  const [contactSaved, setContactSaved] = useState<string | null>(null)
  // Signed in as the family's second guardian, not the main account (owner,
  // 2026-10-22): the account's email and phone are the main account's to change.
  const [isGuardian, setIsGuardian] = useState(false)
  // A view-only family member (owner, 2026-10-23) sees the account and
  // changes nothing on it.
  const [viewOnly, setViewOnly] = useState(false)
  const loadSafety = () => fetch('/api/parent/safety', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setSafety(d) }).catch(() => {})
  const [confirmingAdd, setConfirmingAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  /* The add-swimmer confirm had no name, no focus and no Esc (found
     2026-10-15). Not closable while the swimmer is being added. */
  const confirmBox = useDialogFocus(confirmingAdd, () => { if (!adding) setConfirmingAdd(false) })

  useEffect(() => { fetchAll() }, [])
  /* The "add a swimmer" card on the home page lands here with ?add=1, and the
     form should already be open -- a parent who came to add a child should not
     have to find the button a second time. */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('add') === '1') setShowAddForm(true)
  }, [])

  async function fetchAll() {
    const { data: { user } } = await supabase.auth.getUser()
    // Both of these were a bare `return`, which left a coach, an admin, an
    // orphan account or an expired session on "Loading…" for ever (found
    // 2026-10-05). Send them where dashboard/page.tsx sends them.
    if (!user) { router.replace('/login'); return }
    const [familyId, role] = await Promise.all([myParentId(supabase, user.id), myFamilyRole(supabase)])
    setViewOnly(role === 'viewer')
    if (role !== 'viewer') loadSafety()
    const { data: parentData } = familyId
      ? await supabase.from('parents').select('*').eq('id', familyId).single()
      : { data: null }
    if (!parentData) {
      const { data: admin } = await supabase
        .from('admins').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (admin) { router.replace('/admin'); return }
      const { data: coach } = await supabase
        .from('coaches').select('id, is_active').eq('auth_user_id', user.id).maybeSingle()
      // An inactive coach goes to the PIN page (which signs them out), not
      // to /coach, which sends them back here.
      if (coach) { router.replace(coach.is_active ? '/coach' : '/coach-login?inactive=1'); return }
      router.replace('/login')
      return
    }
    setParent(parentData)
    setIsGuardian(!!parentData.auth_user_id && parentData.auth_user_id !== user.id)
    // is_account_holder exists once docs/migration-account-holder-swimmer.sql
    // has run; before that the list is read without it.
    const readStuds = (cols: string) => supabase.from('students').select(cols).eq('parent_id', parentData.id).eq('is_active', true).order('sort_order')
    const first = await readStuds('id, full_name, date_of_birth, added_by_parent, is_account_holder')
    const { data: studs } = first.error && missingHolderColumn(first.error)
      ? await readStuds('id, full_name, date_of_birth, added_by_parent') : first
    setStudents((studs as unknown as Student[]) || [])
    setLoading(false)
  }

  async function toggleNewsletter() {
    if (!parent) return
    setNewsletterSaving(true)
    setNewsletterError(null)
    const newVal = !parent.newsletter_subscribed
    /* The switch moves only once the row is written (found 2026-10-15). An
       error, or an expired session that RLS turns into zero rows, used to flip
       it anyway, so a parent could read "off" and still get the emails. */
    try {
      const { data, error } = await supabase.from('parents').update({ newsletter_subscribed: newVal })
        .eq('id', parent.id).select('newsletter_subscribed')
      if (error || !data || data.length !== 1) throw new Error('not saved')
      setParent(prev => prev ? { ...prev, newsletter_subscribed: newVal } : prev)
    } catch {
      setNewsletterError(t('err.generic'))
    } finally {
      setNewsletterSaving(false)
    }
  }

  const MAX_STUDENTS = 3

  async function submitAddStudent() {
    if (!parent || !newName.trim()) return
    // Required: the database will not store a swimmer without a birthday.
    if (!newDob) { setAddError(t('register.err.studentDob')); setConfirmingAdd(false); return }
    // The date picker's max stops a click on a future day, not a typed one.
    if (newDob && newDob > new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })) {
      setAddError(t('register.err.dobFuture')); setConfirmingAdd(false); return
    }
    setAdding(true)
    setAddError(null)
    /* Through the server (found 2026-10-08): it checks the three-swimmer limit
       and writes the row itself, so the browser no longer needs -- or has --
       write access to students. */
    let res: Response | null = null
    let j: { error?: string; code?: string } = {}
    try {
      res = await fetch('/api/parent/students', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: newName.trim(), date_of_birth: newDob, is_account_holder: newMe && isAdultOn(newDob, todayLA()), medical: newMedical }),
      })
      j = await res.json().catch(() => ({}))
    } catch { res = null }
    if (!res || !res.ok) {
      const why = !res ? t('cart.err.network')
        : j.code === 'LIMIT' ? t('account.limitReached', { n: MAX_STUDENTS })
        : j.code === 'DOB_FUTURE' ? t('register.err.dobFuture')
        : j.code === 'DOB' ? t('register.err.studentDob')
        : j.code === 'MEDICAL' ? t('safety.err.medical')
        // A name the server will not take (the field stops at 120 characters,
        // so this is rare) or its own failure: English text with no key
        // (found 2026-10-15).
        : j.code === 'NAME' || res.status >= 500 ? t('err.generic')
        : (() => { const k = errorKey(j.error); return k ? t(k) : (j.error || t('err.generic')) })()
      setAddError(t('account.err.addFailed') + why)
      setAdding(false)
      setConfirmingAdd(false)
      return
    }
    setNewName('')
    setNewDob('')
    setNewMe(false)
    setNewMedical(null)
    setShowAddForm(false)
    setConfirmingAdd(false)
    setAdding(false)
    await fetchAll()
    loadSafety()
  }

  /* In the parent's language. A birthday is a date with no time, so it is
     read as UTC and printed as UTC -- read as local time, "2016-05-03" came
     out as May 2 in California. */
  const fmt = (d: string, dateOnly = false) =>
    new Date(d).toLocaleDateString(INTL_LOCALE[locale] || 'en-US', { year: 'numeric', month: 'long', day: 'numeric', ...(dateOnly ? { timeZone: 'UTC' } : {}) })

  if (loading) return (
    <div className="ac-root ac-loading">
      <style>{ACCT_CSS}</style>
      {t('account.loading')}
    </div>
  )

  const full = students.length >= MAX_STUDENTS
  // Chinese sentences and brackets take no spaces between them.
  const zh = locale.startsWith('zh')

  return (
    <div className="ac-root">
      <style>{ACCT_CSS}</style>
      <div className="ac-wrap">

        <div className="ac-head">
          <Link href="/dashboard" className="ac-back">← {t('common.backToDashboard')}</Link>
          <h1 className="ac-h1">{t('account.title')}</h1>
          <p className="ac-sub">{t('account.subtitle')}</p>
        </div>

        <div className="ac-stack">

          {/* Profile */}
          <section className="ac-card">
            <p className="ac-label">{t('account.profile')}</p>
            <div className="ac-grid">
              {([
                { label: t('account.name'), value: `${parent?.first_name} ${parent?.last_name}` },
                { label: t('account.email'), value: parent?.email, edit: 'email' },
                { label: t('account.phone'), value: parent?.phone ? formatPhone(parent.phone) : '—', edit: 'phone' },
                { label: t('account.memberSince'), value: parent?.registered_at ? fmt(parent.registered_at) : '—' },
                // The family's emergency contact (owner, 2026-10-22: it lives
                // with the family's details; the health answers sit with each
                // swimmer below). Both edit in the same safety dialog.
                ...(safety ? [{
                  label: t('safety.contact.title'), edit: 'safety' as const, wide: true, missing: !safety.contact,
                  value: safety.contact ? `${safety.contact.name}${safety.contact.relation ? (zh ? `（${safety.contact.relation}）` : ` (${safety.contact.relation})`) : ''} · ${formatPhone(safety.contact.phone)}` : t('safety.notAnswered'),
                }] : []),
              ] as { label: string; value?: string; edit?: 'email' | 'phone' | 'safety'; wide?: boolean; missing?: boolean }[]).map(item => (
                <div key={item.label} style={item.wide ? { gridColumn: '1 / -1' } : undefined}>
                  <div className="ac-k">{item.label}</div>
                  <div className="ac-v" style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere', ...(item.missing ? { color: '#b4321f' } : {}) }}>{item.value}</span>
                    {item.edit && !viewOnly && (item.edit === 'safety' || !isGuardian) && (
                      <button type="button" className="tap-auto" onClick={() => {
                        if (item.edit === 'safety') { setSafetyOpen(true); return }
                        setContactSaved(null); setContactEdit(item.edit!)
                      }}
                        aria-label={t(item.edit === 'email' ? 'account.contact.titleEmail' : item.edit === 'phone' ? 'account.contact.titlePhone' : 'safety.contact.title')}
                        style={{ background: 'none', border: 'none', padding: 0, color: '#1f5fbf', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        {t('account.contact.change')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {isGuardian && <p className="ac-note" style={{ marginTop: 10 }}>{t(viewOnly ? 'account.guardian.viewerOnly' : 'account.guardian.mainOnly')}</p>}
            {contactSaved && <div className="ac-okmsg" role="status" style={{ marginTop: 10 }}>✓ {contactSaved}</div>}
            {contactEdit && (
              <ContactChange field={contactEdit} onClose={() => setContactEdit(null)}
                onDone={v => {
                  const f = contactEdit
                  setParent(prev => (prev ? { ...prev, [f]: v } : prev))
                  setContactSaved(t(f === 'email' ? 'account.contact.doneEmail' : 'account.contact.donePhone', { value: f === 'phone' ? formatPhone(v) : v }))
                }} />
            )}
          </section>

          <GuardianSection mainName={`${parent?.first_name || ''} ${parent?.last_name || ''}`.trim()} />

          {/* Newsletter */}
          {!viewOnly && <section className="ac-card ac-row">
            <div>
              <b>{t('account.newsletter')}</b>
              <small>{t('account.newsletterDesc')}</small>
              {newsletterError && <div className="ac-err" role="alert">{newsletterError}</div>}
            </div>
            <button type="button" role="switch" aria-checked={!!parent?.newsletter_subscribed} aria-label={t('account.newsletter')}
              onClick={toggleNewsletter} disabled={newsletterSaving} className="tap-auto ac-toggle">
              <span />
            </button>
          </section>}

          {/* Swimmers (add-only) with each one's health answer (owner,
              2026-10-22: one card instead of a separate safety card). */}
          <section className="ac-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <p className="ac-label" style={{ margin: 0 }}>{t('account.students')}</p>
              {safety && safety.students.length > 0 && (
                <button type="button" className="ac-btn line" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => setSafetyOpen(true)}>
                  {safety.missing ? t('account.healthFill') : t('account.healthEdit')}
                </button>
              )}
            </div>
            {safety?.missing && <div className="ac-err" style={{ marginTop: 10 }}>{t('safety.banner.body')}</div>}
            {students.length > 0 && (
              <div className="ac-stack" style={{ gap: 10, marginTop: 12 }}>
                {students.map(s => {
                  const h = safety?.students.find(x => x.id === s.id)
                  return (
                    <div key={s.id} className="ac-item">
                      <div style={{ minWidth: 0 }}>
                        <b>{s.full_name}</b>
                        <small>{s.date_of_birth ? fmt(s.date_of_birth, true) : t('account.noBirthday')}</small>
                        {h && (
                          <small style={{ display: 'block', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 4, ...(!h.answered ? { color: '#b4321f' } : {}) }}>
                            {t('account.healthLabel')}{t('account.healthSep')}{!h.answered ? t('safety.notAnswered') : h.medical_notes || t('safety.medical.none')}
                          </small>
                        )}
                        {s.added_by_parent && !viewOnly && <div className="ac-tag">{t('account.addedByYou')}</div>}
                        {/* Ticking the box on a new swimmer moves "you" to them. */}
                        {s.is_account_holder && !viewOnly && !(showAddForm && newMe) && <div className="ac-tag">{t('account.isYou')}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="ac-note">{t('account.contactSchool')}{zh ? '' : ' '}{t('safety.who')}</p>

            {viewOnly ? null : !showAddForm || full ? (
              <>
                <button type="button" className="ac-add" onClick={() => setShowAddForm(true)} disabled={full}>
                  + {t('account.addSwimmer')}
                </button>
                {/* A greyed button with no reason reads as broken. */}
                {full && <p className="ac-note" style={{ marginTop: 8 }}>{t('account.limitReached', { n: MAX_STUDENTS })}</p>}
              </>
            ) : (
              <div className="ac-item" style={{ display: 'block' }}>
                <div style={{ marginBottom: 12 }}>
                  <label className="ac-flabel" htmlFor="ac-name">{t('register.fullName')}</label>
                  <input id="ac-name" className="ac-input" type="text" value={newName} maxLength={120}
                    onChange={e => setNewName(e.target.value)} placeholder={t('account.namePlaceholder')} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label className="ac-flabel" htmlFor="ac-dob">{t('account.dob')} <span style={{ color: '#c0392b' }}>*</span></label>
                  <input id="ac-dob" className="ac-input" type="date" value={newDob}
                    max={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })}
                    onChange={e => { setNewDob(e.target.value); if (!isAdultOn(e.target.value, todayLA())) setNewMe(false) }} />
                </div>
                {/* Only for an adult: a child cannot be the account holder. */}
                {isAdultOn(newDob, todayLA()) && (
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14, cursor: 'pointer' }}>
                    <input type="checkbox" checked={newMe} onChange={e => setNewMe(e.target.checked)}
                      style={{ marginTop: 2, width: 20, height: 20, flexShrink: 0, accentColor: '#2050a0' }} />
                    <span style={{ fontSize: 14, color: '#16294a', lineHeight: 1.5 }}>{t('register.isMe')}</span>
                  </label>
                )}
                <div style={{ marginBottom: 14 }}>
                  <MedicalQuestion id="ac-med" name={newName.trim()} value={newMedical} onChange={setNewMedical} />
                </div>
                {/* role="alert": a failure closes the confirm, so nothing else says it failed. */}
                {addError && <div className="ac-err" role="alert" style={{ marginTop: 0, marginBottom: 12 }}>{addError}</div>}
                <div className="ac-pair">
                  <button type="button" className="ac-btn line"
                    onClick={() => { setShowAddForm(false); setNewName(''); setNewDob(''); setNewMe(false); setNewMedical(null); setAddError(null) }}>
                    {t('common.cancel')}
                  </button>
                  <button type="button" className="ac-btn gold" onClick={() => setConfirmingAdd(true)} disabled={!newName.trim() || !newDob || medicalToStore(newMedical) === undefined}>
                    {t('account.submit')}
                  </button>
                </div>
              </div>
            )}
          </section>

          {!viewOnly && <AccountPrivacy />}

        </div>
      </div>

      {safetyOpen && <SafetyEditor parentPhone={parent?.phone} onClose={() => setSafetyOpen(false)} onSaved={() => loadSafety()} />}

      {confirmingAdd && (
        <div className="ac-back-drop" onClick={() => !adding && setConfirmingAdd(false)}>
          <div ref={confirmBox} className="ac-modal" role="dialog" aria-modal="true" aria-labelledby="ac-add-title" onClick={e => e.stopPropagation()}>
            <h2 id="ac-add-title">{t('account.confirmTitle')}</h2>
            <p>{t('account.confirmA')}<strong>{newName}</strong>{t('account.confirmB')}</p>
            <div className="ac-pair">
              <button type="button" className="ac-btn line" onClick={() => setConfirmingAdd(false)} disabled={adding}>
                {t('common.cancel')}
              </button>
              <button type="button" className="ac-btn gold" onClick={submitAddStudent} disabled={adding}>
                {adding ? t('account.adding') : t('account.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
