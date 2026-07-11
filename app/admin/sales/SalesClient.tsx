'use client'
import { useState, useMemo } from 'react'
import { PLAN_GROUPS } from '@/lib/plans'

const PAGE_SIZE = 20

const PAYMENT_METHODS = [
  { value: 'All', label: 'All' },
  { value: 'stripe', label: 'Stripe Online' },
  { value: 'Credit Card (Terminal)', label: 'Credit Card (Terminal)' },
  { value: 'cash', label: 'Cash' },
]

function fDate(s: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
}
function fTime(s: string) {
  if (!s) return ''
  return new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' })
}

export default function SalesClient({ invoices, parentMap }: { invoices: any[], parentMap: Record<string, any> }) {
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

      // Package type
      if (planGroup !== 'All') {
        const group = PLAN_GROUPS.find(g => g.label === planGroup)
        if (!group) return false
        const groupLabels = ['1-on-1 Private', '1-on-2 Semi-Private', '1-on-4 Group', 'Swim Team']
        const matches = planName.toLowerCase().includes(planGroup.toLowerCase().split(' ')[0].replace('1-on-', '1-on-'))
          || planName.startsWith(planGroup)
        if (!matches) return false
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
        inv.issued_at ? `${fDate(inv.issued_at)} ${fTime(inv.issued_at)}` : '—',
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
          <h1 className="text-2xl font-bold text-white font-serif">Sales</h1>
          <p className="text-gray-400 mt-1">All lesson package purchases</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-[#111d38] border border-[#1e3a6e] rounded-xl px-6 py-4 text-right">
            <p className="text-gray-400 text-xs uppercase tracking-wider">
              {hasFilter ? `Filtered (${filtered.length})` : `Total (${invoices.length})`}
            </p>
            <p className="text-[#c9a84c] text-2xl font-bold">${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <button onClick={exportCSV} className="bg-[#c9a84c] hover:bg-[#b8973b] text-[#1a2744] text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#111d38] border border-[#1e3a6e] rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <label className="text-gray-500 text-xs uppercase tracking-wider block mb-1">Search Customer</label>
          <input
            type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Name or email..."
            className="w-full bg-[#0d1829] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#c9a84c]"
          />
        </div>
        {/* Package type */}
        <div>
          <label className="text-gray-500 text-xs uppercase tracking-wider block mb-1">Package Type</label>
          <select value={planGroup} onChange={e => { setPlanGroup(e.target.value); setPage(1) }}
            className="bg-[#0d1829] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#c9a84c]">
            <option value="All">All</option>
            {PLAN_GROUPS.map(g => <option key={g.label} value={g.label}>{g.label}</option>)}
          </select>
        </div>
        {/* Payment method */}
        <div>
          <label className="text-gray-500 text-xs uppercase tracking-wider block mb-1">Payment Method</label>
          <select value={payMethod} onChange={e => { setPayMethod(e.target.value); setPage(1) }}
            className="bg-[#0d1829] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#c9a84c]">
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        {/* Date range */}
        <div>
          <label className="text-gray-500 text-xs uppercase tracking-wider block mb-1">Date Range</label>
          <select value={dateRange} onChange={e => { setDateRange(e.target.value); setPage(1) }}
            className="bg-[#0d1829] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#c9a84c]">
            <option value="All">All Time</option>
            <option value="Week">Last 7 Days</option>
            <option value="Month">This Month</option>
            <option value="Quarter">This Quarter</option>
          </select>
        </div>
        {hasFilter && (
          <button onClick={resetFilters} className="text-gray-400 hover:text-white text-sm px-3 py-2 border border-[#1e3a6e] rounded-lg transition-colors">
            Clear Filters
          </button>
        )}
      </div>

      {/* Table */}
      {paged.length === 0 ? (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-12 text-center">
          <p className="text-gray-400">No purchases match the filters</p>
        </div>
      ) : (
        <>
          <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] overflow-hidden mb-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1e3a6e]">
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">Invoice #</th>
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">Customer</th>
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">Plan</th>
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">Payment</th>
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">Amount</th>
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-5 py-3">Purchased At</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((inv: any) => {
                  const parent = parentMap[inv.parent_id]
                  const planName = Array.isArray(inv.items) && inv.items[0]?.name ? inv.items[0].name : '—'
                  return (
                    <tr key={inv.id} className="border-b border-[#1e3a6e]/50 hover:bg-[#1e3a6e]/20 transition-colors">
                      <td className="px-5 py-4 text-gray-400 text-xs font-mono">{inv.invoice_number}</td>
                      <td className="px-5 py-4">
                        <p className="text-white text-sm">{parent ? `${parent.first_name} ${parent.last_name}` : '—'}</p>
                        <p className="text-gray-500 text-xs">{parent?.email}</p>
                      </td>
                      <td className="px-5 py-4 text-gray-300 text-sm">{planName}</td>
                      <td className="px-5 py-4 text-gray-400 text-xs">{inv.payment_method || '—'}</td>
                      <td className="px-5 py-4 text-white text-sm font-medium">${(inv.amount || 0).toFixed(2)}</td>
                      <td className="px-5 py-4 text-gray-400 text-sm">
                        {fDate(inv.issued_at)}<br/>
                        <span className="text-xs text-gray-600">{fTime(inv.issued_at)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-[#1e3a6e] disabled:opacity-30 hover:border-[#c9a84c] transition-colors">
                ← Previous
              </button>
              <span className="px-3 py-1.5 text-white">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-[#1e3a6e] disabled:opacity-30 hover:border-[#c9a84c] transition-colors">
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
