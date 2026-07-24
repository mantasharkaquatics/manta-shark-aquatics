import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCoachBlocks, blockedIntervalsFor } from '@/lib/availability'
import { getEffectiveZones } from '@/lib/zones'
import { getTodayLA } from '@/lib/date'
import { bandKey } from '@/lib/zone-colors'

// Parent 1on4 class-based booking (cross-coach).
// GET ?student_id&date=YYYY-MM-DD          → that day's matching-band classes across all coaches
// GET ?student_id&year=YYYY&month=1..12    → dates in that month with at least one matching class (calendar dots)
// GET ?student_id&weeks=1..6[&start=YYYY-MM-DD] → per-day class lists for the coming weeks (weekly schedule section)
// Band matching: zone rows with null band admit all levels (legacy).

const BANDS: [number, number][] = [[1, 2], [3, 4], [5, 6], [7, 9]]
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const idxTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function bandMatches(z: { group_level_min?: number | null; group_level_max?: number | null }, level: number) {
  if (z.group_level_min == null || z.group_level_max == null) return true
  return level >= z.group_level_min && level <= z.group_level_max
}

async function dayClasses(s: any, date: string, level: number, student_id: string, ct: any, coaches: any[], coachName: Record<string, string>) {
  const coachIds = (coaches || []).map((c: any) => c.id)
  const [effList, blocksAll, { data: allSess }] = await Promise.all([
    Promise.all(coachIds.map((id: string) => getEffectiveZones(s, id, date))),
    getCoachBlocks(s, coachIds, date),
    s.from('class_sessions').select('id, coach_id, start_time, course_type_id, enrolled_count, max_students, status').eq('session_date', date),
  ])
  const sess = allSess || []
  const ids = sess.map((x: any) => x.id)
  let myTimes = new Set<string>()
  if (ids.length > 0) {
    const { data: myB } = await s.from('bookings').select('class_session_id')
      .in('class_session_id', ids).eq('student_id', student_id)
      .not('status', 'in', '("cancelled","pending_partner")')
    myTimes = new Set((myB || []).map((b: any) => String(sess.find((x: any) => x.id === b.class_session_id)?.start_time || '').slice(0, 5)))
  }

  const classes: any[] = []
  coachIds.forEach((cid: string, i: number) => {
    const eff = effList[i]
    if (eff.legacy) return
    const blocked = blockedIntervalsFor(blocksAll, cid)
    for (const z of eff.rows) {
      if (z.zone_type !== 'group' || !bandMatches(z, level)) continue
      for (let m = toMin(z.start_time); m + ct.duration_minutes <= toMin(z.end_time); m += 30) {
        const t = idxTime(m)
        if (blocked.some((b: any) => b.start == null || b.end == null || (m < toMin(String(b.end).slice(0, 5)) && m + ct.duration_minutes > toMin(String(b.start).slice(0, 5))))) continue
        const clash = sess.find((x: any) => x.coach_id === cid && String(x.start_time).slice(0, 5) === t && x.course_type_id !== ct.id && x.enrolled_count > 0)
        if (clash) continue
        const own = sess.find((x: any) => x.coach_id === cid && String(x.start_time).slice(0, 5) === t && x.course_type_id === ct.id)
        const enrolled = own ? own.enrolled_count : 0
        classes.push({
          time: t, end_time: idxTime(m + ct.duration_minutes),
          coach_id: cid, coach_name: coachName[cid] || '',
          enrolled, max: ct.max_students, full: enrolled >= ct.max_students,
          session_id: own && enrolled < ct.max_students ? own.id : undefined,
          already_booked: myTimes.has(t),
          band: bandKey(z.group_level_min, z.group_level_max),
        })
      }
    }
  })
  classes.sort((a, b) => a.time.localeCompare(b.time) || a.coach_name.localeCompare(b.coach_name))
  return classes
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const student_id = q.get('student_id')
  const date = q.get('date')
  const year = q.get('year')
  const month = q.get('month')
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 })

  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: student } = await s.from('students').select('id, current_level').eq('id', student_id).single()
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  const level = student.current_level == null ? null : Number(student.current_level)
  const myBand = level == null ? null : (() => { const b = BANDS.find(([a, z]) => level >= a && level <= z); return b ? { min: b[0], max: b[1] } : null })()
  if (level == null) return NextResponse.json({ band: null, dates: [], classes: [] })

  const [{ data: ct }, { data: coaches }] = await Promise.all([
    s.from('course_types').select('id, max_students, duration_minutes').eq('slug', '1on4').single(),
    s.from('coaches').select('id, first_name, last_name').eq('is_active', true),
  ])
  if (!ct) return NextResponse.json({ error: 'Course type missing' }, { status: 500 })
  const coachName: Record<string, string> = {}
  for (const c of coaches || []) coachName[c.id] = c.first_name

  // ── Day shape ──────────────────────────────────────────────────────
  if (date) {
    const classes = await dayClasses(s, date, level, student_id, ct, coaches || [], coachName)
    return NextResponse.json({ band: myBand, classes })
  }

  // ── Range shape (weekly schedule section) ──────────────────────────
  const weeks = q.get('weeks')
  if (weeks) {
    const n = Math.min(Math.max(Number(weeks) || 4, 1), 6)
    const todayStr = getTodayLA()
    const startParam = q.get('start')
    const startStr = startParam && startParam > todayStr ? startParam : todayStr
    const endD = new Date(startStr + 'T00:00:00')
    endD.setDate(endD.getDate() + n * 7 - 1)
    const endStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`
    const { data: zrows } = await s.from('coach_availability_zones')
      .select('coach_id, zone_type, kind, weekday, override_date, group_level_min, group_level_max')
      .or(`kind.eq.weekly,and(kind.eq.date,override_date.gte.${startStr},override_date.lte.${endStr})`)
    const byCoach: Record<string, any[]> = {}
    for (const r of zrows || []) (byCoach[r.coach_id] ||= []).push(r)
    const candidates: string[] = []
    const cur = new Date(startStr + 'T00:00:00')
    while (true) {
      const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
      if (ds > endStr) break
      const dow = cur.getDay()
      for (const cid of Object.keys(byCoach)) {
        const rows = byCoach[cid]
        const dateRows = rows.filter(r => r.kind === 'date' && r.override_date === ds)
        const picked = dateRows.length > 0 ? dateRows : rows.filter(r => r.kind === 'weekly' && r.weekday === dow)
        if (picked.some(r => r.zone_type === 'closed')) continue
        if (picked.some(r => r.zone_type === 'group' && bandMatches(r, level))) { candidates.push(ds); break }
      }
      cur.setDate(cur.getDate() + 1)
    }
    const days = await Promise.all(candidates.map(async ds => ({ date: ds, classes: await dayClasses(s, ds, level, student_id, ct, coaches || [], coachName) })))
    return NextResponse.json({ band: myBand, days: days.filter(d => d.classes.length > 0) })
  }

  // ── Month shape (calendar dots) ────────────────────────────────────
  if (year && month) {
    const y = Number(year), mo = Number(month)
    const last = new Date(y, mo, 0).getDate()
    const mm = String(mo).padStart(2, '0')
    const startD = `${y}-${mm}-01`, endD = `${y}-${mm}-${String(last).padStart(2, '0')}`
    const { data: zrows } = await s.from('coach_availability_zones')
      .select('coach_id, zone_type, kind, weekday, override_date, group_level_min, group_level_max')
      .or(`kind.eq.weekly,and(kind.eq.date,override_date.gte.${startD},override_date.lte.${endD})`)
    const byCoach: Record<string, any[]> = {}
    for (const r of zrows || []) (byCoach[r.coach_id] ||= []).push(r)
    const todayStr = getTodayLA()
    const dates: string[] = []
    for (let d = 1; d <= last; d++) {
      const ds = `${y}-${mm}-${String(d).padStart(2, '0')}`
      if (ds < todayStr) continue
      const dow = new Date(ds + 'T00:00:00').getDay()
      let hit = false
      for (const cid of Object.keys(byCoach)) {
        const rows = byCoach[cid]
        const dateRows = rows.filter(r => r.kind === 'date' && r.override_date === ds)
        const picked = dateRows.length > 0 ? dateRows : rows.filter(r => r.kind === 'weekly' && r.weekday === dow)
        if (picked.some(r => r.zone_type === 'closed')) continue
        if (picked.some(r => r.zone_type === 'group' && bandMatches(r, level))) { hit = true; break }
      }
      if (hit) dates.push(ds)
    }
    return NextResponse.json({ band: myBand, dates })
  }

  return NextResponse.json({ error: 'date or year+month required' }, { status: 400 })
}
