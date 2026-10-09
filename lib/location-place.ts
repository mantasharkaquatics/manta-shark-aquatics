import { activeLocations, showLocations, type Location } from './locations'

/* The place the site names in its titles, descriptions and the home page's
   top line ("Swim lessons in Brea, California").

   While one pool is open to families it is exactly "Brea", so every one of
   those strings reads byte for byte as it did before locations existed -- also
   when the pool list could not be read. With more than one pool it names each
   one, joined the reader's way: "Brea & Monrovia", "Brea 與 Monrovia".
   Pool names stay as they are in every language.

   Safe in the browser: no server imports. */

export const HOME_PLACE = 'Brea'

type Tr = (key: string, vars?: Record<string, string | number>) => string

export function placeName(all: Location[], t: Tr): string {
  if (!showLocations(all)) return HOME_PLACE
  const names = activeLocations(all).map(l => l.name.trim())
  const head = names.slice(0, -1).reduce((a, b) => t('location.place.list', { a, b }))
  return t('location.place.last', { a: head, b: names[names.length - 1] })
}
