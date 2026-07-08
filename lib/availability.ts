// 共用教練封鎖判定:time_off(教練請假)與 admin_block(主管封鎖)
// start_time/end_time 皆 NULL = 整天封鎖;否則為 [start, end) 區間
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

// 課程 [startTime, endTime) 是否撞上該教練任一封鎖區間
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

// 給前端灰格用:回該教練當日所有封鎖區間(null = 整天)
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
