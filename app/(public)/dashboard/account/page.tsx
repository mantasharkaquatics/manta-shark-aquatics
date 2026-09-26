'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useT, useLocale } from '@/lib/i18n/provider'
import { errorKey } from '@/lib/i18n/errors'
import { ACCT_CSS } from '@/components/brand/AcctStyles'

interface Parent {
  id: string; first_name: string; last_name: string; email: string; phone: string
  registered_at: string | null; newsletter_subscribed: boolean; preferred_language: string
}
interface Student { id: string; full_name: string; date_of_birth: string | null; added_by_parent?: boolean }

const INTL_LOCALE: Record<string, string> = { en: 'en-US', 'zh-Hant': 'zh-TW', 'zh-Hans': 'zh-CN' }

export default function AccountPage() {
  const t = useT()
  const locale = useLocale()
  const supabase = createClient()
  const [parent, setParent] = useState<Parent | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [newsletterSaving, setNewsletterSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDob, setNewDob] = useState('')
  const [confirmingAdd, setConfirmingAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [])
  /* The "add a swimmer" card on the home page lands here with ?add=1, and the
     form should already be open -- a parent who came to add a child should not
     have to find the button a second time. */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('add') === '1') setShowAddForm(true)
  }, [])

  async function fetchAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: parentData } = await supabase.from('parents').select('*').eq('auth_user_id', user.id).single()
    if (!parentData) return
    setParent(parentData)
    const { data: studs } = await supabase.from('students').select('id, full_name, date_of_birth, added_by_parent').eq('parent_id', parentData.id).eq('is_active', true).order('sort_order')
    setStudents(studs || [])
    setLoading(false)
  }

  async function toggleNewsletter() {
    if (!parent) return
    setNewsletterSaving(true)
    const newVal = !parent.newsletter_subscribed
    await supabase.from('parents').update({ newsletter_subscribed: newVal }).eq('id', parent.id)
    setParent(prev => prev ? { ...prev, newsletter_subscribed: newVal } : prev)
    setNewsletterSaving(false)
  }

  const MAX_STUDENTS = 3

  async function submitAddStudent() {
    if (!parent || !newName.trim()) return
    setAdding(true)
    setAddError(null)
    const { error } = await supabase.from('students').insert({
      parent_id: parent.id,
      full_name: newName.trim(),
      date_of_birth: newDob || null,
      current_level: null,
      is_active: true,
      added_by_parent: true,
      sort_order: students.length + 1,
    })
    if (error) {
      const k = errorKey(error.message)
      setAddError(t('account.err.addFailed') + (k ? t(k) : error.message))
      setAdding(false)
      setConfirmingAdd(false)
      return
    }
    await supabase.from('parents').update({ last_activity_at: new Date().toISOString() }).eq('id', parent.id)
    setNewName('')
    setNewDob('')
    setShowAddForm(false)
    setConfirmingAdd(false)
    setAdding(false)
    await fetchAll()
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
              {[
                { label: t('account.name'), value: `${parent?.first_name} ${parent?.last_name}` },
                { label: t('account.email'), value: parent?.email },
                { label: t('account.phone'), value: parent?.phone || '—' },
                { label: t('account.memberSince'), value: parent?.registered_at ? fmt(parent.registered_at) : '—' },
              ].map(item => (
                <div key={item.label}>
                  <div className="ac-k">{item.label}</div>
                  <div className="ac-v">{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Newsletter */}
          <section className="ac-card ac-row">
            <div>
              <b>{t('account.newsletter')}</b>
              <small>{t('account.newsletterDesc')}</small>
            </div>
            <button type="button" role="switch" aria-checked={!!parent?.newsletter_subscribed} aria-label={t('account.newsletter')}
              onClick={toggleNewsletter} disabled={newsletterSaving} className="tap-auto ac-toggle">
              <span />
            </button>
          </section>

          {/* Swimmers (read-only, add-only) */}
          <section className="ac-card">
            <p className="ac-label">{t('account.students')}</p>
            {students.length > 0 && (
              <div className="ac-stack" style={{ gap: 10, marginTop: 12 }}>
                {students.map(s => (
                  <div key={s.id} className="ac-item">
                    <div>
                      <b>{s.full_name}</b>
                      <small>{s.date_of_birth ? fmt(s.date_of_birth, true) : t('account.noBirthday')}</small>
                      {s.added_by_parent && <div className="ac-tag">{t('account.addedByYou')}</div>}
                    </div>
                    <span className="ac-muted">{t('account.readOnly')}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="ac-note">{t('account.contactSchool')}</p>

            {!showAddForm || full ? (
              <button type="button" className="ac-add" onClick={() => setShowAddForm(true)} disabled={full}>
                + {t('account.addSwimmer')}
              </button>
            ) : (
              <div className="ac-item" style={{ display: 'block' }}>
                <div style={{ marginBottom: 12 }}>
                  <label className="ac-flabel" htmlFor="ac-name">{t('register.fullName')}</label>
                  <input id="ac-name" className="ac-input" type="text" value={newName}
                    onChange={e => setNewName(e.target.value)} placeholder={t('account.namePlaceholder')} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label className="ac-flabel" htmlFor="ac-dob">{t('account.dob')}</label>
                  <input id="ac-dob" className="ac-input" type="date" value={newDob}
                    max={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })}
                    onChange={e => setNewDob(e.target.value)} />
                </div>
                {addError && <div className="ac-err" style={{ marginTop: 0, marginBottom: 12 }}>{addError}</div>}
                <div className="ac-pair">
                  <button type="button" className="ac-btn line"
                    onClick={() => { setShowAddForm(false); setNewName(''); setNewDob(''); setAddError(null) }}>
                    {t('common.cancel')}
                  </button>
                  <button type="button" className="ac-btn gold" onClick={() => setConfirmingAdd(true)} disabled={!newName.trim()}>
                    {t('account.submit')}
                  </button>
                </div>
              </div>
            )}
          </section>

        </div>
      </div>

      {confirmingAdd && (
        <div className="ac-back-drop" onClick={() => !adding && setConfirmingAdd(false)}>
          <div className="ac-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h2>{t('account.confirmTitle')}</h2>
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
