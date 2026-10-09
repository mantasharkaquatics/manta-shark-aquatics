'use client'

import { useCallback, useEffect, useState } from 'react'
import AlertModal from '@/components/AlertModal'
import { useT } from '@/lib/i18n/provider'
import type { Location } from '@/lib/locations'
import { locationColor } from '@/lib/location-colors'

type Draft = { name: string; address: string; map_url: string }
const draftOf = (l: Location): Draft => ({ name: l.name, address: l.address || '', map_url: l.map_url || '' })

/* The pools. Name, address and map link are what families read on lesson
   cards and in emails once more than one pool is open; "open to families" is
   the switch that makes a pool bookable (and, with a second one on, makes
   locations appear across the site). Which hours a coach teaches at which pool
   is set in Zones, not here. */
export default function AdminLocationsPage() {
  const t = useT()
  const [list, setList] = useState<Location[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/locations').catch(() => null)
    if (!r || !r.ok) { setAlertMsg(t('admin.locations.err.loadFailed')); setList([]); return }
    const locs: Location[] = (await r.json()).locations || []
    setList(locs)
    setDrafts(Object.fromEntries(locs.map(l => [l.id, draftOf(l)])))
  }, [t])
  useEffect(() => { load() }, [load])

  async function send(id: string, patch: Partial<Draft & { is_active: boolean }>): Promise<Location | null> {
    setBusy(id); setSaved(null)
    const r = await fetch('/api/admin/locations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }),
    }).catch(() => null)
    setBusy(null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (!r || !r.ok) {
      const known = ['name', 'address', 'mapUrl', 'lastOpen']
      setAlertMsg(known.includes(d.code) ? t(`admin.locations.err.${d.code}`) : t('admin.locations.err.saveFailed'))
      return null
    }
    const loc: Location = d.location
    setList(prev => (prev || []).map(l => l.id === loc.id ? loc : l))
    return loc
  }

  async function saveText(l: Location) {
    const dr = drafts[l.id]
    const loc = await send(l.id, { name: dr.name, address: dr.address, map_url: dr.map_url })
    if (loc) { setDrafts(prev => ({ ...prev, [loc.id]: draftOf(loc) })); setSaved(loc.id) }
  }

  if (!list) return <div className="p-8 text-gray-400 text-sm">{t('common.loading')}</div>
  const openCount = list.filter(l => l.is_active).length

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      <h1 className="text-2xl font-bold text-white">{t('admin.nav.locations')}</h1>
      <p className="text-gray-400 text-sm mt-1">{t('admin.locations.intro')}</p>
      <p className={`text-sm mt-3 rounded-lg border px-3 py-2 ${openCount > 1 ? 'border-[#a3e635]/40 text-[#a3e635]' : 'border-[#1e3a6e] text-gray-300'}`}>
        {openCount > 1 ? t('admin.locations.stateShown', { n: openCount }) : t('admin.locations.stateHidden')}
      </p>

      {list.length === 0 && <p className="text-gray-500 text-sm mt-6">{t('admin.locations.empty')}</p>}

      <div className="space-y-4 mt-6">
        {list.map(l => {
          const dr = drafts[l.id] || draftOf(l)
          const dirty = dr.name !== l.name || dr.address !== (l.address || '') || dr.map_url !== (l.map_url || '')
          const field = (key: keyof Draft, label: string, placeholder?: string) => (
            <label className="block">
              <span className="text-gray-500 text-xs uppercase tracking-wider">{label}</span>
              <input value={dr[key]} placeholder={placeholder}
                onChange={e => { const v = e.target.value; setDrafts(prev => ({ ...prev, [l.id]: { ...dr, [key]: v } })); setSaved(null) }}
                className="mt-1 w-full rounded-lg border border-[#1e3a6e] bg-[#0d1529] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-[#c9a84c] focus:outline-none" />
            </label>
          )
          return (
            <div key={l.id} className="rounded-xl border border-[#1e3a6e] bg-[#111d38] p-4" style={{ borderLeft: `4px solid ${locationColor(l.id, list)}` }}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <p className="text-white font-semibold">{l.name} <span className="text-gray-500 text-xs font-normal">· {l.id}</span></p>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${l.is_active ? 'text-green-400' : 'text-gray-400'}`}>
                    {l.is_active ? t('admin.locations.open') : t('admin.locations.hidden')}
                  </span>
                  <button role="switch" aria-checked={l.is_active} aria-label={t('admin.locations.toggle', { name: l.name })}
                    disabled={busy === l.id}
                    onClick={() => send(l.id, { is_active: !l.is_active })}
                    className={`tap-auto relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${l.is_active ? 'bg-green-500' : 'bg-gray-600'}`}>
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${l.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {field('name', t('admin.locations.name'))}
                {field('address', t('admin.locations.address'), t('admin.locations.addressPlaceholder'))}
              </div>
              <div className="mt-3">{field('map_url', t('admin.locations.mapUrl'), 'https://maps.app.goo.gl/…')}</div>
              <p className="text-gray-500 text-xs mt-1">{t('admin.locations.mapUrlHint')}</p>
              <div className="flex items-center justify-end gap-3 mt-3">
                {saved === l.id && !dirty && <span className="text-green-400 text-sm">{t('admin.locations.saved')}</span>}
                <button onClick={() => saveText(l)} disabled={!dirty || busy === l.id}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#c9a84c] text-[#111d38] disabled:opacity-40">
                  {busy === l.id ? t('admin.locations.saving') : t('admin.locations.save')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
