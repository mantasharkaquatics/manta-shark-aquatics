'use client'

import { useState } from 'react'

type Application = {
  id: string
  created_at: string
  status: string
  role_applied: string
  full_name: string
  email: string
  phone: string
  city: string | null
  is_18_or_over: boolean
  work_authorized: boolean
  swim_experience: string
  certifications: string | null
  availability: string | null
  weekly_hours: string | null
  earliest_start: string | null
  referral_source: string | null
  message: string | null
  resume_path: string | null
  admin_notes: string | null
}

// The admin shell is #0d1529 with #111d38 panels and #1e3a6e hairlines; this page
// was the last one still painted for a white background, which left it glaring
// next to the navy sidebar. Colours only below -- the panel, the inset (inputs,
// which sit one step darker than the panel they live in) and the hairline.
const PANEL = '#111d38'
const INSET = '#0d1529'
const BORDER = '#1e3a6e'
const GOLD = '#c9a84c'
const TEXT = '#e6ebf5'
const MUTED = 'rgba(255,255,255,0.45)'

const STATUSES = ['new', 'reviewing', 'interview', 'hired', 'rejected', 'archived']

// Lightened from the original set: #16a34a and #3b82f6 are chosen to read on
// white and go muddy on navy, so each is the 400-weight instead. Rejected moves
// from grey to red, which is what the rest of the site uses for "did not happen"
// and stops it looking identical to archived.
const STATUS_COLOR: Record<string, string> = {
  new: '#60a5fa',
  reviewing: '#c9a84c',
  interview: '#a78bfa',
  hired: '#4ade80',
  rejected: '#f87171',
  archived: '#94a3b8',
}

const ROLE_LABEL: Record<string, string> = {
  swim_coach: 'Swim coach',
  front_desk: 'Front desk',
  lifeguard: 'Lifeguard',
  other: 'Other',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div style={{ margin: '0 0 14px' }}>
      <div style={{ fontSize: '12px', color: MUTED, fontWeight: 600, marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '15px', color: TEXT, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{value}</div>
    </div>
  )
}

export default function AdminApplicationsClient({ applications }: { applications: Application[] }) {
  const [rows, setRows] = useState(applications)
  const [selectedId, setSelectedId] = useState<string | null>(applications[0]?.id ?? null)
  const [filter, setFilter] = useState('open')
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [message, setMessage] = useState('')
  // One banner served both "Notes saved." and "Could not save.", so a failure was
  // painted in whatever colour the success case happened to get.
  const [msgTone, setMsgTone] = useState<'ok' | 'err'>('err')
  const notify = (text: string, tone: 'ok' | 'err' = 'err') => { setMessage(text); setMsgTone(tone) }

  const visible = rows.filter((r) =>
    filter === 'all' ? true : filter === 'open'
      ? !['hired', 'rejected', 'archived'].includes(r.status)
      : r.status === filter
  )

  const selected = rows.find((r) => r.id === selectedId) || null

  function select(app: Application) {
    setSelectedId(app.id)
    setNotes(app.admin_notes || '')
    setMessage('')
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch('/api/admin/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      notify(data.error || 'Could not save.')
      return false
    }
    return true
  }

  async function changeStatus(id: string, status: string) {
    const before = rows
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)))
    const ok = await patch(id, { status })
    if (!ok) setRows(before)
  }

  async function saveNotes() {
    if (!selected) return
    setSavingNotes(true)
    setMessage('')
    const ok = await patch(selected.id, { adminNotes: notes })
    if (ok) {
      setRows((rs) => rs.map((r) => (r.id === selected.id ? { ...r, admin_notes: notes } : r)))
      notify('Notes saved.', 'ok')
    }
    setSavingNotes(false)
  }

  async function openResume(id: string) {
    setMessage('')
    const res = await fetch(`/api/admin/applications/resume?id=${encodeURIComponent(id)}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.url) {
      notify(data.error || 'Could not open the résumé.')
      return
    }
    window.open(data.url, '_blank', 'noopener')
  }

  const toneColor = msgTone === 'ok' ? '#4ade80' : '#f87171'

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* The layout's <main> already supplies the page padding, and there can only
          be one <main> in a document -- this file used to open a second one. */}
      <style>{`@media (max-width: 900px) { .apps-grid { grid-template-columns: 1fr !important } }`}</style>

      <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 900, color: '#fff', margin: '0 0 6px' }}>
        Applications
      </h1>
      <p style={{ fontSize: '14px', color: MUTED, margin: '0 0 20px' }}>
        {rows.length} total · {rows.filter((r) => r.status === 'new').length} new
      </p>

      <div style={{ display: 'flex', gap: '8px', margin: '0 0 18px', flexWrap: 'wrap' }}>
        {['open', 'all', ...STATUSES].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              background: filter === f ? BORDER : 'transparent',
              color: filter === f ? GOLD : 'rgba(255,255,255,0.6)',
              border: '1px solid ' + (filter === f ? GOLD : BORDER),
              borderRadius: '999px', padding: '6px 14px', fontSize: '13px',
              fontWeight: filter === f ? 700 : 500,
              cursor: 'pointer', textTransform: 'capitalize',
            }}>
            {f}
          </button>
        ))}
      </div>

      {message ? (
        <div style={{ background: toneColor + '18', border: '1px solid ' + toneColor + '55', color: toneColor,
          borderRadius: '10px', padding: '10px 14px', fontSize: '14px', margin: '0 0 16px' }}>
          {message}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p style={{ color: MUTED }}>No applications yet.</p>
      ) : (
        <div className="apps-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: '20px', alignItems: 'start' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {visible.length === 0 ? (
              <p style={{ color: MUTED, fontSize: '14px' }}>Nothing in this filter.</p>
            ) : visible.map((app) => (
              <button key={app.id} onClick={() => select(app)}
                style={{
                  textAlign: 'left', background: selectedId === app.id ? BORDER : PANEL,
                  border: '1px solid ' + (selectedId === app.id ? GOLD : BORDER),
                  borderRadius: '12px', padding: '12px 14px', cursor: 'pointer',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, color: '#fff', fontSize: '15px' }}>{app.full_name}</span>
                  <span style={{
                    background: (STATUS_COLOR[app.status] || '#94a3b8') + '1f',
                    border: '1px solid ' + (STATUS_COLOR[app.status] || '#94a3b8') + '4d',
                    color: STATUS_COLOR[app.status] || '#94a3b8',
                    fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                    textTransform: 'capitalize',
                  }}>{app.status}</span>
                </div>
                <div style={{ fontSize: '13px', color: MUTED, marginTop: '4px' }}>
                  {ROLE_LABEL[app.role_applied] || app.role_applied} · {fmtDate(app.created_at)}
                </div>
              </button>
            ))}
          </div>

          {selected ? (
            <div style={{ background: PANEL, border: '1px solid ' + BORDER, borderRadius: '14px', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '18px', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: 900, color: '#fff', margin: '0 0 4px' }}>
                    {selected.full_name}
                  </h2>
                  <div style={{ fontSize: '14px', color: MUTED }}>
                    {ROLE_LABEL[selected.role_applied] || selected.role_applied}
                    {selected.city ? ' · ' + selected.city : ''} · applied {fmtDate(selected.created_at)}
                  </div>
                </div>
                {/* colorScheme tells the browser to render the native option list
                    dark too -- without it the popup stays white on macOS. */}
                <select value={selected.status} onChange={(e) => changeStatus(selected.id, e.target.value)}
                  style={{ border: '1px solid ' + BORDER, borderRadius: '8px', padding: '7px 10px',
                    fontSize: '14px', textTransform: 'capitalize', background: INSET,
                    color: '#fff', colorScheme: 'dark' }}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <a href={`mailto:${selected.email}`} style={{ fontSize: '14px', color: GOLD, fontWeight: 600 }}>
                  {selected.email}
                </a>
                <span style={{ color: BORDER }}>|</span>
                <a href={`tel:${selected.phone}`} style={{ fontSize: '14px', color: GOLD, fontWeight: 600 }}>
                  {selected.phone}
                </a>
              </div>

              <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', fontSize: '13px' }}>
                <span style={{ color: selected.is_18_or_over ? '#4ade80' : '#f87171' }}>
                  {selected.is_18_or_over ? '✓' : '✗'} 18 or older
                </span>
                <span style={{ color: selected.work_authorized ? '#4ade80' : '#f87171' }}>
                  {selected.work_authorized ? '✓' : '✗'} Authorized to work
                </span>
              </div>

              {selected.resume_path ? (
                <button onClick={() => openResume(selected.id)}
                  style={{ background: GOLD, color: PANEL, border: 'none', borderRadius: '8px',
                    padding: '9px 16px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                    marginBottom: '20px' }}>
                  Open résumé
                </button>
              ) : (
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', marginBottom: '20px' }}>No résumé uploaded.</p>
              )}

              <Row label="Swimming experience" value={selected.swim_experience} />
              <Row label="Certifications" value={selected.certifications} />
              <Row label="Availability" value={selected.availability} />
              <Row label="Hours per week" value={selected.weekly_hours} />
              <Row label="Earliest start" value={selected.earliest_start} />
              <Row label="Heard about us via" value={selected.referral_source} />
              <Row label="Message" value={selected.message} />

              <div style={{ borderTop: '1px solid ' + BORDER, paddingTop: '18px', marginTop: '4px' }}>
                <div style={{ fontSize: '12px', color: MUTED, fontWeight: 600, marginBottom: '6px' }}>
                  Internal notes
                </div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: '90px',
                    border: '1px solid ' + BORDER, borderRadius: '8px', padding: '10px',
                    fontSize: '14px', fontFamily: 'inherit', resize: 'vertical',
                    background: INSET, color: TEXT, colorScheme: 'dark' }} />
                <button onClick={saveNotes} disabled={savingNotes}
                  style={{ marginTop: '8px', background: 'transparent', color: GOLD,
                    border: '1px solid ' + GOLD, borderRadius: '8px', padding: '8px 16px',
                    fontSize: '14px', fontWeight: 600,
                    opacity: savingNotes ? 0.5 : 1,
                    cursor: savingNotes ? 'not-allowed' : 'pointer' }}>
                  {savingNotes ? 'Saving…' : 'Save notes'}
                </button>
              </div>
            </div>
          ) : (
            <p style={{ color: MUTED }}>Select an application.</p>
          )}
        </div>
      )}
    </div>
  )
}
