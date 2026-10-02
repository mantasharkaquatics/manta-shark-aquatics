'use client'
import { useState, useMemo } from 'react'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag, type Locale } from '@/lib/i18n'

const PAGE_SIZE = 20

const PAYMENT_METHODS = [
  { value: 'All', labelKey: 'admin.sales.all' },
  { value: 'stripe', labelKey: 'admin.sales.pm.stripe' },
  { value: 'Credit Card (Terminal)', labelKey: 'admin.sales.pm.terminal' },
  { value: 'cash', labelKey: 'admin.sales.pm.cash' },
]

// Sale-type filter: value is matched in the filter logic, label is shown.
const SALE_TYPES = [
  { value: 'All', labelKey: 'admin.sales.all' },
  { value: 'Points', labelKey: 'admin.sales.type.points' },
  { value: 'Swim Team', labelKey: 'admin.sales.type.team' },
  { value: 'Other', labelKey: 'admin.sales.type.other' },
]

// The Payment column prints invoices.payment_method as stored. Known values get
// a label whose English is the stored value itself, so the English page is
// unchanged; anything else is shown raw.
const PM_RAW_KEYS: Record<string, string> = {
  stripe: 'admin.sales.pmRaw.stripe',
  'Credit Card (Terminal)': 'admin.sales.pm.terminal',
  stripe_terminal: 'admin.sales.pmRaw.stripeTerminal',
  card: 'admin.sales.pmRaw.card',
  cash: 'admin.sales.pmRaw.cash',
}

// locale is 'en' for the CSV export, which stays English for the accountant.
function fDate(s: string, locale: Locale) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
}
function fTime(s: string) {
  if (!s) return ''
  return new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' })
}

export default function SalesClient({ invoices, parentMap }: { invoices: any[], parentMap: Record<string, any> }) {
  const t = useT()
  // The plan column prints the invoice's own item name, which is written in
  // English when the invoice is made. The two shapes the system writes are
  // shown in the admin's language; anything else (SDP notes, team lines) as is.
  const planLabel = (name: string) => {
    const pts = /^([\d,]+) lesson points$/.exec(name)
    if (pts) return t('admin.sales.plan.points', { n: pts[1] })
    const assess = /^Swim Assessment - (.+)$/.exec(name)
    if (assess) return t('admin.sales.plan.assessment', { name: assess[1] })
    return name
  }
  const locale = useLocale()
  const [search, setSearch] = useState('')
  const [planGroup, setPlanGroup] = useState('All')
  const [payMethod, setPayMethod] = useState('All')
  const [dateRange, setDateRange] = useState('All')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const now = new Date()
    return invoices.filter((inv: any) => {
      const parent = parentMap[inv.parent_id]
      const fullName = parent ? `${parent.first_name} ${parent.last_name}`.toLowerCase() : ''
      const email = parent?.email?.toLowerCase() || ''
      const planName: string = Array.isArray(inv.items) && inv.items[0]?.name ? inv.items[0].name : ''

      // Search
      if (search) {
        const q = search.toLowerCase()
        if (!fullName.includes(q) && !email.includes(q)) return false
      }

      // Sale type. There are only two things sold now -- points and team
      // memberships -- so the third bucket is honestly named: it holds the old
      // package invoices and anything else recorded by hand.
      if (planGroup !== 'All') {
        const isTeamInvoice = !!inv.team_membership_id || planName.toLowerCase().startsWith('swim team')
        const isPoints = /points/i.test(planName)
        if (planGroup === 'Swim Team' && !isTeamInvoice) return false
        if (planGroup === 'Points' && (!isPoints || isTeamInvoice)) return false
        if (planGroup === 'Other' && (isPoints || isTeamInvoice)) return false
      }

      // Payment method
      if (payMethod !== 'All' && inv.payment_method !== payMethod) return false

      // Date range
      if (dateRange !== 'All') {
        const d = new Date(inv.issued_at)
        if (dateRange === 'Week') {
          const start = new Date(now); start.setDate(now.getDate() - 7)
          if (d < start) return false
        } else if (dateRange === 'Month') {
          const start = new Date(now.getFullYear(), now.getMonth(), 1)
          if (d < start) return false
        } else if (dateRange === 'Quarter') {
          const q = Math.floor(now.getMonth() / 3)
          const start = new Date(now.getFullYear(), q * 3, 1)
          if (d < start) return false
        }
      }
      return true
    })
  }, [invoices, parentMap, search, planGroup, payMethod, dateRange])

  const total = filtered.reduce((sum: number, i: any) => sum + (i.amount || 0), 0)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function exportCSV() {
    const rows = [['Invoice #', 'Customer', 'Email', 'Plan', 'Payment Method', 'Amount', 'Purchased At']]
    for (const inv of filtered) {
      const parent = parentMap[inv.parent_id]
      const planName = Array.isArray(inv.items) && inv.items[0]?.name ? inv.items[0].name : '—'
      rows.push([
        inv.invoice_number || '',
        parent ? `${parent.first_name} ${parent.last_name}` : '—',
        parent?.email || '',
        planName,
        inv.payment_method || '—',
        `$${(inv.amount || 0).toFixed(2)}`,
        inv.issued_at ? `${fDate(inv.issued_at, 'en')} ${fTime(inv.issued_at)}` : '—',
      ])
    }
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `sales-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  function resetFilters() {
    setSearch(''); setPlanGroup('All'); setPayMethod('All'); setDateRange('All'); setPage(1)
  }

  const hasFilter = search || planGroup !== 'All' || payMethod !== 'All' || dateRange !== 'All'

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white font-serif">{t('admin.sales.title')}</h1>
          <p className="text-gray-400 mt-1">{t('admin.sales.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-[#111d38] border border-[#1e3a6e] rounded-xl px-6 py-4 text-right">
            <p className="text-gray-400 text-xs uppercase tracking-wider">
              {hasFilter ? t('admin.sales.filteredCount', { n: filtered.length }) : t('admin.sales.totalCount', { n: invoices.length })}
            </p>
            <p className="text-[#c9a84c] text-2xl font-bold">${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <button onClick={exportCSV} className="bg-[#c9a84c] hover:bg-[#b8973b] text-[#1a2744] text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            {t('admin.sales.exportCsv')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#111d38] border border-[#1e3a6e] rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <label className="text-gray-500 text-xs uppercase tracking-wider block mb-1">{t('admin.sales.searchCustomer')}</label>
          <input
            type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder={t('admin.sales.searchPlaceholder')}
            className="w-full bg-[#0d1829] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#c9a84c]"
          />
        </div>
        {/* Package type */}
        <div>
          <label className="text-gray-500 text-xs uppercase tracking-wider block mb-1">{t('admin.sales.saleType')}</label>
          <select value={planGroup} onChange={e => { setPlanGroup(e.target.value); setPage(1) }}
            className="bg-[#0d1829] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#c9a84c]">
            {SALE_TYPES.map(g => <option key={g.value} value={g.value}>{t(g.labelKey)}</option>)}
          </select>
        </div>
        {/* Payment method */}
        <div>
          <label className="text-gray-500 text-xs uppercase tracking-wider block mb-1">{t('admin.sales.paymentMethod')}</label>
          <select value={payMethod} onChange={e => { setPayMethod(e.target.value); setPage(1) }}
            className="bg-[#0d1829] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#c9a84c]">
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{t(m.labelKey)}</option>)}
          </select>
        </div>
        {/* Date range */}
        <div>
          <label className="text-gray-500 text-xs uppercase tracking-wider block mb-1">{t('admin.sales.dateRange')}</label>
          <select value={dateRange} onChange={e => { setDateRange(e.target.value); setPage(1) }}
            className="bg-[#0d1829] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#c9a84c]">
            <option value="All">{t('admin.sales.range.all')}</option>
            <option value="Week">{t('admin.sales.range.week')}</option>
            <option value="Month">{t('admin.sales.range.month')}</option>
            <option value="Quarter">{t('admin.sales.range.quarter')}</option>
          </select>
        </div>
        {hasFilter && (
          <button onClick={resetFilters} className="text-gray-400 hover:text-white text-sm px-3 py-2 border border-[#1e3a6e] rounded-lg transition-colors">
            {t('admin.sales.clearFilters')}
          </button>
        )}
      </div>

      {/* Table */}
      {paged.length === 0 ? (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-12 text-center">
          <p className="text-gray-400">{t('admin.sales.empty')}</p>
        </div>
      ) : (
        <>
          <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] overflow-hidden mb-4">
            {/* The card around this table is overflow-hidden for its rounded corners, so on
              a narrow screen the last columns were being clipped away entirely -- no
              scrollbar, no hint they existed. This wrapper scrolls instead of clipping,
              and the min-width stops the columns collapsing into unreadable slivers. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
              <thead>
                <tr className="border-b border-[#1e3a6e]">
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">{t('admin.sales.col.invoice')}</th>
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">{t('admin.sales.col.customer')}</th>
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">{t('admin.sales.col.plan')}</th>
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">{t('admin.sales.col.payment')}</th>
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">{t('admin.sales.col.amount')}</th>
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">{t('admin.sales.col.purchasedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((inv: any) => {
                  const parent = parentMap[inv.parent_id]
                  const planName = Array.isArray(inv.items) && inv.items[0]?.name ? inv.items[0].name : '—'
                  return (
                    <tr key={inv.id} className="border-b border-[#1e3a6e]/50 hover:bg-[#1e3a6e]/20 transition-colors">
                      <td className="px-5 py-4 text-gray-400 text-xs font-mono">{inv.invoice_number}{inv.student_id && !inv.team_membership_id ? <span className="ml-2 px-1.5 py-0.5 rounded bg-[#c9a84c]/20 text-[#c9a84c] text-[10px] font-sans font-semibold align-middle">SDP</span> : null}</td>
                      <td className="px-5 py-4">
                        <p className="text-white text-sm">{parent ? `${parent.first_name} ${parent.last_name}` : '—'}</p>
                        <p className="text-gray-500 text-xs">{parent?.email}</p>
                      </td>
                      <td className="px-5 py-4 text-gray-300 text-sm">{planLabel(planName)}</td>
                      <td className="px-5 py-4 text-gray-400 text-xs">{inv.payment_method ? (PM_RAW_KEYS[inv.payment_method] ? t(PM_RAW_KEYS[inv.payment_method]) : inv.payment_method) : '—'}</td>
                      <td className="px-5 py-4 text-white text-sm font-medium">${(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-5 py-4 text-gray-400 text-sm">
                        {fDate(inv.issued_at, locale)}<br/>
                        <span className="text-xs text-gray-600">{fTime(inv.issued_at)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>{t('admin.sales.showing', { from: (page-1)*PAGE_SIZE+1, to: Math.min(page*PAGE_SIZE, filtered.length), total: filtered.length })}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-[#1e3a6e] disabled:opacity-30 hover:border-[#c9a84c] transition-colors">
                {t('admin.sales.prev')}
              </button>
              <span className="px-3 py-1.5 text-white">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-[#1e3a6e] disabled:opacity-30 hover:border-[#c9a84c] transition-colors">
                {t('admin.sales.next')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
