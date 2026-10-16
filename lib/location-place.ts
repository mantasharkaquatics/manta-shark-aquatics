import { activeLocations, showLocations, DEFAULT_LOCATION_ID, type Location } from './locations'

/* The place the site names in its titles, descriptions and the home page's
   top line ("Swim lessons in Brea, California").

   While Brea is the one pool open to families it is exactly "Brea", so every
   one of those strings reads byte for byte as it did before locations existed
   -- also when the pool list could not be read. When the one open pool is
   another (Brea hidden, Monrovia open) it is that pool's name: the site went on
   saying Brea, where nobody could book (found 2026-10-15, F167). With more
   than one pool it names each one, joined the reader's way: "Brea & Monrovia",
   "Brea 與 Monrovia".
   Pool names stay as they are in every language.

   Safe in the browser: no server imports. */

export const HOME_PLACE = 'Brea'

type Tr = (key: string, vars?: Record<string, string | number>) => string

export function placeName(all: Location[], t: Tr): string {
  if (!showLocations(all)) {
    const open = activeLocations(all)
    return open.length === 1 && open[0].id !== DEFAULT_LOCATION_ID ? open[0].name.trim() : HOME_PLACE
  }
  const names = activeLocations(all).map(l => l.name.trim())
  const head = names.slice(0, -1).reduce((a, b) => t('location.place.list', { a, b }))
  return t('location.place.last', { a: head, b: names[names.length - 1] })
}
