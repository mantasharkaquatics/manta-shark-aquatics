// Shared coach-block logic: time_off (coach leave) and admin_block (admin block)
// start_time/end_time both NULL = all-day block; otherwise a [start, end) range
import type { SupabaseClient } from '@supabase/supabase-js'

export type CoachBlock = {
  coach_id: string
  date: string
  start_time: string | null
  end_time: string | null
  block_type: string
}

export async function getCoachBlocks(
  svc: SupabaseClient,
  coachIds: string[],
  date: string
): Promise<CoachBlock[]> {
  if (!coachIds.length) return []
  const { data } = await svc
    .from('coach_time_off')
    .select('coach_id, date, start_time, end_time, block_type')
    .in('coach_id', coachIds)
    .eq('date', date)
  return (data || []) as CoachBlock[]
}

export function toMin(t: string): number {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

// Whether lesson [startTime, endTime) overlaps any of the coach's blocked ranges
export function isBlocked(
  blocks: CoachBlock[],
  coachId: string,
  startTime: string,
  endTime: string
): boolean {
  const s = toMin(startTime)
  const e = toMin(endTime)
  return blocks.some(b => {
    if (b.coach_id !== coachId) return false
    if (b.start_time == null || b.end_time == null) return true
    const bs = toMin(b.start_time)
    const be = toMin(b.end_time)
    return s < be && e > bs
  })
}

// For frontend gray cells: return all of the coach's blocked ranges that day (null = all day)
export function blockedIntervalsFor(
  blocks: CoachBlock[],
  coachId: string
): { start: string | null; end: string | null }[] {
  return blocks
    .filter(b => b.coach_id === coachId)
    .map(b => ({
      start: b.start_time ? String(b.start_time).slice(0, 5) : null,
      end: b.end_time ? String(b.end_time).slice(0, 5) : null,
    }))
}
