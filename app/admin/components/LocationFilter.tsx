'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useT } from '@/lib/i18n/provider'
import { DEFAULT_LOCATION_ID, type Location } from '@/lib/locations'
import { locationColor } from '@/lib/location-colors'

/* The "All / Brea / Monrovia" switch on the staff calendars (booking,
   schedule, check-in), and the small pool tag on each lesson.

   Staff see every pool, including one not yet open to families, so both show
   as soon as the table holds more than one pool -- unlike the parent site,
   which waits for two OPEN pools (showLocations). With one pool nothing here
   renders and nothing is filtered.

   The choice is remembered per page in this browser only: the Monrovia desk
   tablet keeps "Monrovia" while the office laptop keeps "All". localStorage
   can throw (private mode, blocked storage), so every touch is guarded and the
   page simply starts at "All". */

export type LocationFilterState = {
  locations: Location[]
  /** More than one pool exists (open or not): the switch and tags show. */
  multi: boolean
  /** 'all' or a pool id. */
  filter: string
  setFilter: (v: string) => void
  /** Whether a lesson at this pool is shown under the current choice. */
  matches: (locationId: string | null | undefined) => boolean
  nameOf: (locationId: string | null | undefined) => string
  colorOf: (locationId: string | null | undefined) => string
}

const storageKey = (page: string) => `admin.locationFilter.${page}`

/**
 * The switch's state for one page. Pass `initial` when the server already read
 * the pools; otherwise they are fetched once from /api/admin/locations.
 */
export function useLocationFilterState(page: string, initial?: Location[]): LocationFilterState {
  const [locations, setLocations] = useState<Location[]>(initial || [])
  const [stored, setStored] = useState('all')

  useEffect(() => {
    try { const v = window.localStorage.getItem(storageKey(page)); if (v) setStored(v) } catch {}
    if (initial) return
    let alive = true
    fetch('/api/admin/locations')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d && Array.isArray(d.locations)) setLocations(d.locations) })
      .catch(() => {})
    return () => { alive = false }
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  const multi = locations.length > 1
  // A remembered pool that no longer exists (or before the list arrives) is "All".
  const filter = multi && locations.some(l => l.id === stored) ? stored : 'all'

  const setFilter = useCallback((v: string) => {
    setStored(v)
    try { window.localStorage.setItem(storageKey(page), v) } catch {}
  }, [page])

  return useMemo(() => ({
    locations,
    multi,
    filter,
    setFilter,
    matches: (id: string | null | undefined) => filter === 'all' || (id || DEFAULT_LOCATION_ID) === filter,
    nameOf: (id: string | null | undefined) => {
      const key = id || DEFAULT_LOCATION_ID
      return locations.find(l => l.id === key)?.name || key
    },
    colorOf: (id: string | null | undefined) => locationColor(id || DEFAULT_LOCATION_ID, locations),
  }), [locations, multi, filter, setFilter])
}

const Ctx = createContext<LocationFilterState | null>(null)

/** For a server-rendered page: holds the state so LocationSwitch / LocationOnly / LocationTag inside can read it. */
export function LocationFilterProvider({ page, locations, children }: { page: string; locations: Location[]; children: ReactNode }) {
  const state = useLocationFilterState(page, locations)
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}

function useFilterState(state?: LocationFilterState): LocationFilterState | null {
  const fromCtx = useContext(Ctx)
  return state || fromCtx
}

/** All / each pool. Renders nothing while only one pool exists. */
export function LocationSwitch({ state, className = '' }: { state?: LocationFilterState; className?: string }) {
  const t = useT()
  const s = useFilterState(state)
  if (!s || !s.multi) return null
  const opts = [{ id: 'all', name: t('admin.locations.filterAll') }, ...s.locations.map(l => ({ id: l.id, name: l.name }))]
  return (
    <div role="group" aria-label={t('admin.locations.filterLabel')} className={`inline-flex rounded-lg overflow-hidden border border-white/20 ${className}`}>
      {opts.map(o => {
        const on = s.filter === o.id
        return (
          <button key={o.id} onClick={() => s.setFilter(o.id)} aria-pressed={on}
            className={`px-3 min-h-9 text-xs font-semibold transition-colors flex items-center gap-1.5 ${on ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'}`}>
            {o.id !== 'all' && <span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: s.colorOf(o.id) }} />}
            {o.name}
          </button>
        )
      })}
    </div>
  )
}

/** Shows its children only when one of the given pools is selected (or "All"). */
export function LocationOnly({ locs, children }: { locs: (string | null | undefined)[]; children: ReactNode }) {
  const s = useFilterState()
  if (!s || !s.multi || s.filter === 'all') return <>{children}</>
  const known = locs.filter(l => l !== undefined)
  // Nothing to go on (a row whose lesson was not read): keep it rather than hide it.
  if (known.length === 0) return <>{children}</>
  return known.some(l => s.matches(l)) ? <>{children}</> : null
}

/** A small pill naming the lesson's pool. Renders nothing while only one pool exists. */
export function LocationTag({ loc, state, className = '' }: { loc: string | null | undefined; state?: LocationFilterState; className?: string }) {
  const s = useFilterState(state)
  // undefined = the lesson itself was not read; naming the default pool would be a guess.
  if (!s || !s.multi || loc === undefined) return null
  const c = s.colorOf(loc)
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-px text-[10px] font-semibold leading-tight align-middle whitespace-nowrap ${className}`}
      style={{ color: c, border: `1px solid ${c}66`, backgroundColor: 'rgba(13,21,41,0.55)' }}>
      {s.nameOf(loc)}
    </span>
  )
}
