import type { SupabaseClient } from '@supabase/supabase-js'
import { STROKES, type Stroke, type SwimTime, type Unit } from '@/lib/swim-times'

/* The server side of 成績 (lib/swim-times.ts). */

export type LessonTime = { distance: number; stroke: Stroke; cs: number }

/** What a coach sent with a report, kept to sane events and times; one per event. */
export function cleanLessonTimes(raw: unknown): LessonTime[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: LessonTime[] = []
  for (const x of raw.slice(0, 8)) {
    const distance = Number((x as LessonTime)?.distance)
    const stroke = String((x as LessonTime)?.stroke) as Stroke
    const cs = Math.round(Number((x as LessonTime)?.cs))
    if (!Number.isInteger(distance) || distance < 5 || distance > 1500) continue
    if (!STROKES.includes(stroke) || !Number.isFinite(cs) || cs < 100 || cs > 99999) continue
    const k = distance + stroke
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ distance, stroke, cs })
  }
  return out
}

const missing = (e: { message?: string; code?: string } | null) => !!e && (e.code === '42P01' || /swim_times|schema cache/.test(e.message || ''))

/** A report's times, replacing the ones a resend of it had sent before. They
 *  wait with the report (pending) until an admin confirms it. */
export async function saveLessonTimes(svc: SupabaseClient, o: { studentId: string; lessonKey: string; coachId: string; on: string; times: LessonTime[] }) {
  const { error: delErr } = await svc.from('swim_times').delete()
    .eq('student_id', o.studentId).eq('lesson_key', o.lessonKey).eq('status', 'pending')
  if (delErr) { (missing(delErr) ? console.warn : console.error)('swim-times: clear', delErr.message); return }
  if (!o.times.length) return
  const { error } = await svc.from('swim_times').insert(o.times.map(x => ({
    student_id: o.studentId, lesson_key: o.lessonKey, coach_id: o.coachId,
    distance: x.distance, unit: 'yd', stroke: x.stroke, time_cs: x.cs, swum_on: o.on, status: 'pending',
  })))
  if (error) console.error('swim-times: save', error.message)
}

/** The report was confirmed: its times go live with it. */
export async function approveLessonTimes(svc: SupabaseClient, o: { studentId: string; lessonKey: string | null; adminId: string }) {
  if (!o.lessonKey) return
  const { error } = await svc.from('swim_times').update({ status: 'approved', reviewed_by: o.adminId, reviewed_at: new Date().toISOString() })
    .eq('student_id', o.studentId).eq('lesson_key', o.lessonKey).eq('status', 'pending')
  if (error) (missing(error) ? console.warn : console.error)('swim-times: approve', error.message)
}

/** The times waiting with these reports, for the admin's Reviews cards. */
export async function pendingLessonTimes(svc: SupabaseClient, pairs: { studentId: string; lessonKey: string | null }[]) {
  const ids = [...new Set(pairs.map(p => p.studentId))]
  const out = new Map<string, { distance: number; stroke: Stroke; cs: number }[]>()
  if (!ids.length) return out
  const { data, error } = await svc.from('swim_times').select('student_id, lesson_key, distance, stroke, time_cs')
    .in('student_id', ids).eq('status', 'pending')
  if (error) return out
  for (const r of (data || []) as { student_id: string; lesson_key: string; distance: number; stroke: Stroke; time_cs: number }[]) {
    const k = r.student_id + '|' + r.lesson_key
    out.set(k, [...(out.get(k) || []), { distance: r.distance, stroke: r.stroke, cs: r.time_cs }])
  }
  return out
}

/** Everything a family may see for one swimmer: confirmed lesson tests and
 *  the published meets' results. */
export async function familySwimTimes(svc: SupabaseClient, studentId: string): Promise<SwimTime[]> {
  const out: SwimTime[] = []
  const { data: lt } = await svc.from('swim_times').select('id, distance, unit, stroke, time_cs, swum_on')
    .eq('student_id', studentId).eq('status', 'approved')
  for (const r of (lt || []) as { id: string; distance: number; unit: Unit; stroke: Stroke; time_cs: number; swum_on: string }[]) {
    out.push({ id: r.id, source: 'lesson', distance: r.distance, unit: r.unit, stroke: r.stroke, cs: r.time_cs, on: r.swum_on })
  }
  const { data: sw } = await svc.from('meet_swimmers').select('id, meet_id').eq('student_id', studentId)
  const swimmers = (sw || []) as { id: number; meet_id: number }[]
  if (swimmers.length) {
    const [{ data: meets }, { data: entries }] = await Promise.all([
      svc.from('meet_meets').select('id, title, meet_date, published').in('id', [...new Set(swimmers.map(s => s.meet_id))]),
      svc.from('meet_entries').select('id, event_id, swimmer_id, result_cs').in('swimmer_id', swimmers.map(s => s.id)).not('result_cs', 'is', null),
    ])
    const live = new Map(((meets || []) as { id: number; title: string; meet_date: string | null; published: boolean }[])
      .filter(m => m.published).map(m => [m.id, m]))
    const evIds = [...new Set(((entries || []) as { event_id: number }[]).map(e => e.event_id))]
    const { data: events } = evIds.length
      ? await svc.from('meet_events').select('id, meet_id, distance, unit, stroke').in('id', evIds)
      : { data: [] }
    const ev = new Map(((events || []) as { id: number; meet_id: number; distance: number | null; unit: Unit | null; stroke: Stroke | null }[]).map(e => [e.id, e]))
    for (const e of (entries || []) as { id: number; event_id: number; result_cs: number }[]) {
      const event = ev.get(e.event_id)
      const meet = event && live.get(event.meet_id)
      if (!event || !meet || !event.distance || !event.stroke || !meet.meet_date) continue
      out.push({ id: 'm' + e.id, source: 'meet', distance: event.distance, unit: event.unit || 'yd', stroke: event.stroke, cs: e.result_cs, on: meet.meet_date, meet: meet.title })
    }
  }
  return out.sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0))
}
