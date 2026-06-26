'use client'
import { useState } from 'react'

const GOLD = '#c9a84c'
const NAVY = '#1a2744'

export default function AdminInvoicesClient({ invoices, parents, courseTypes }: {
  invoices: any[]
  parents: any[]
  courseTypes: any[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    parent_id: '',
    amount: '',
    payment_method: 'cash',
    course_type_id: '',
    sessions: '',
    notes: '',
  })

  async function handleCreate() {
    if (!form.parent_id || !form.amount || !form.course_type_id || !form.sessions) {
      alert('請填寫所有必填欄位')
      return
    }
    setSubmitting(true)
    const ct = courseTypes.find(c => c.id === form.course_type_id)
    const sessions = parseInt(form.sessions)
    const amount = parseFloat(form.amount)
    const unitPrice = amount / sessions

    const res = await fetch('/api/invoices/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent_id: form.parent_id,
        amount,
        payment_method: form.payment_method,
        items: [{ name: `${ct?.name || 'Swim Lesson'} Package`, quantity: sessions, unit_price: unitPrice }],
        notes: form.notes || null,
      }),
    })
    if (res.ok) {
      const { invoice } = await res.json()
      // 寄 email
      const parent = parents.find(p => p.id === form.parent_id)
      if (parent?.email) {
        await fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'invoice',
            to: parent.email,
            parentName: parent.first_name,
            invoiceNumber: invoice.invoice_number,
            invoiceId: invoice.id,
            amount,
          }),
        })
      }
      alert(`發票 ${invoice.invoice_number} 已建立並寄出`)
      setShowForm(false)
      setForm({ parent_id: '', amount: '', payment_method: 'cash', course_type_id: '', sessions: '', notes: '' })
      window.location.reload()
    } else {
      alert('建立失敗，請重試')
    }
    setSubmitting(false)
  }

  async function handleResend(invoice: any) {
    setResendingId(invoice.id)
    const parent = Array.isArray(invoice.parents) ? invoice.parents[0] : invoice.parents
    await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'invoice',
        to: parent?.email,
        parentName: parent?.first_name,
        invoiceNumber: invoice.invoice_number,
        invoiceId: invoice.id,
        amount: invoice.amount,
      }),
    })
    alert(`已重寄發票至 ${parent?.email}`)
    setResendingId(null)
  }

  const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0)

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#fff', fontFamily: 'Playfair Display, serif', margin: 0 }}>Invoices</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontSize: '14px' }}>發票管理 · 共 {invoices.length} 張 · 總金額 ${totalRevenue.toFixed(2)}</p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background: GOLD, color: NAVY, border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
          + 手動開立發票
        </button>
      </div>

      {/* 手動開立表單 */}
      {showForm && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '20px' }}>手動開立發票（現金 / Zelle / 其他）</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '11px', color: GOLD, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>家長 *</label>
              <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', padding: '10px 12px', fontSize: '13px' }}>
                <option value="">選擇家長</option>
                {parents.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.email})</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: GOLD, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>課程類型 *</label>
              <select value={form.course_type_id} onChange={e => setForm(f => ({ ...f, course_type_id: e.target.value }))}
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', padding: '10px 12px', fontSize: '13px' }}>
                <option value="">選擇課程</option>
                {courseTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: GOLD, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>堂數 *</label>
              <input type="number" value={form.sessions} onChange={e => setForm(f => ({ ...f, sessions: e.target.value }))} placeholder="10"
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', padding: '10px 12px', fontSize: '13px' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: GOLD, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>總金額 (USD) *</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="800"
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', padding: '10px 12px', fontSize: '13px' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: GOLD, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>付款方式</label>
              <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', padding: '10px 12px', fontSize: '13px' }}>
                <option value="cash">現金 (Cash)</option>
                <option value="zelle">Zelle</option>
                <option value="check">支票 (Check)</option>
                <option value="venmo">Venmo</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: GOLD, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>備註</label>
              <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="選填"
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', padding: '10px 12px', fontSize: '13px' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button onClick={handleCreate} disabled={submitting}
              style={{ background: GOLD, color: NAVY, border: 'none', padding: '10px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              {submitting ? '建立中...' : '建立並寄出發票'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ background: 'transparent', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)', padding: '10px 20px', borderRadius: '10px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* 發票列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {invoices.map(inv => {
          const parent = Array.isArray(inv.parents) ? inv.parents[0] : inv.parents
          return (
            <div key={inv.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: GOLD }}>{inv.invoice_number}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                    {new Date(inv.issued_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{parent?.first_name} {parent?.last_name}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{parent?.email}</div>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', padding: '3px 10px', borderRadius: '20px' }}>
                  {inv.payment_method === 'stripe' ? 'Credit Card' : inv.payment_method}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '16px', fontWeight: 800, color: GOLD }}>${Number(inv.amount).toFixed(2)}</span>
                <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '11px', fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '5px 12px', borderRadius: '8px', textDecoration: 'none' }}>
                  檢視
                </a>
                <button onClick={() => handleResend(inv)} disabled={resendingId === inv.id}
                  style={{ fontSize: '11px', fontWeight: 600, color: NAVY, background: GOLD, padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
                  {resendingId === inv.id ? '寄送中...' : '重寄'}
                </button>
              </div>
            </div>
          )
        })}
        {invoices.length === 0 && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '40px', fontSize: '14px' }}>尚無發票記錄</div>
        )}
      </div>
    </div>
  )
}
