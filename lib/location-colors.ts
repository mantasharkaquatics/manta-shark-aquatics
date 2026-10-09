/* One colour per pool, for the staff screens that mark which pool a block or a
   lesson is at (Zones editor, booking calendar, schedule, check-in).

   Chosen to stay clear of every colour lib/zone-colors.ts already uses (gold
   private, green group, the four band colours, the three team reds/pinks) and
   of the editor's purple date-override accent: a pool mark that looked like a
   band would read as a band. Pools are coloured by their place in the list
   (sort_order), so Brea is always the first and Monrovia the second. */
export const LOCATION_COLORS = ['#e2e8f0', '#a3e635']

export function locationColor(id: string | null | undefined, all: { id: string }[]): string {
  const i = all.findIndex(l => l.id === id)
  return LOCATION_COLORS[(i >= 0 ? i : 0) % LOCATION_COLORS.length]
}
