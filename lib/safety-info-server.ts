// Server side of lib/safety-info.ts: reading and writing a family's safety
// information with the service role. The browser cannot write parents or
// students any more (docs/migration-revoke-parent-writes.sql).

import { phoneDigits, type EmergencyContact } from '@/lib/safety-info'

type Svc = any

export type SafetyStudent = { id: string; full_name: string; medical_notes: string | null; answered: boolean }
export type SafetyInfo = { contact: EmergencyContact | null; students: SafetyStudent[]; missing: boolean }

/** A missing column (docs/migration-safety-info.sql not run yet) reads as
 *  "unanswered" rather than failing the page. */
export async function readSafety(svc: Svc, parentId: string): Promise<SafetyInfo | null> {
  let parent: any = null
  {
    const r = await svc.from('parents').select('emergency_contact_name, emergency_contact_phone, emergency_contact_relation').eq('id', parentId).maybeSingle()
    if (r.error) {
      const r2 = await svc.from('parents').select('emergency_contact_name, emergency_contact_phone').eq('id', parentId).maybeSingle()
      if (r2.error) return null
      parent = r2.data
    } else parent = r.data
  }
  let rows: any[] = []
  {
    const r = await svc.from('students').select('id, full_name, medical_notes, medical_confirmed_at').eq('parent_id', parentId).eq('is_active', true).order('sort_order')
    if (r.error) {
      const r2 = await svc.from('students').select('id, full_name, medical_notes').eq('parent_id', parentId).eq('is_active', true).order('sort_order')
      if (r2.error) return null
      rows = r2.data || []
    } else rows = r.data || []
  }
  const contact = parent?.emergency_contact_name && parent?.emergency_contact_phone
    ? { name: parent.emergency_contact_name, relation: parent.emergency_contact_relation || '', phone: parent.emergency_contact_phone }
    : null
  const students: SafetyStudent[] = rows.map(s => ({
    id: s.id, full_name: s.full_name, medical_notes: s.medical_notes ?? null,
    // Notes written before the question existed count as answered.
    answered: !!s.medical_confirmed_at || !!(s.medical_notes && String(s.medical_notes).trim()),
  }))
  return { contact, students, missing: !contact || !contact.relation || students.some(s => !s.answered) }
}

/** One swimmer's answer: null = no known conditions. */
export async function saveMedical(svc: Svc, parentId: string, studentId: string, notes: string | null): Promise<boolean> {
  const now = new Date().toISOString()
  const r = await svc.from('students').update({ medical_notes: notes, medical_confirmed_at: now })
    .eq('id', studentId).eq('parent_id', parentId).select('id')
  if (!r.error) return (r.data || []).length === 1
  // Before the migration: keep the text at least.
  const r2 = await svc.from('students').update({ medical_notes: notes }).eq('id', studentId).eq('parent_id', parentId).select('id')
  if (r2.error) console.error('[safety] medical not saved', studentId, r2.error.message)
  return !r2.error && (r2.data || []).length === 1
}

export async function saveContact(svc: Svc, parentId: string, c: EmergencyContact): Promise<boolean> {
  const base = { emergency_contact_name: c.name.trim(), emergency_contact_phone: phoneDigits(c.phone) }
  const r = await svc.from('parents').update({ ...base, emergency_contact_relation: c.relation.trim() }).eq('id', parentId)
  if (!r.error) return true
  const r2 = await svc.from('parents').update(base).eq('id', parentId)
  if (r2.error) console.error('[safety] contact not saved', parentId, r2.error.message)
  return !r2.error
}

/** What a coach needs for the swimmers in their lessons: medical notes and
 *  the family's emergency contact, keyed by student id. */
export async function safetyForStudents(svc: Svc, studentIds: string[]): Promise<Record<string, { medical: string | null; answered: boolean; contact: EmergencyContact | null }>> {
  const ids = [...new Set(studentIds.filter(Boolean))]
  const out: Record<string, { medical: string | null; answered: boolean; contact: EmergencyContact | null }> = {}
  if (ids.length === 0) return out
  let studs: any[] = []
  {
    const r = await svc.from('students').select('id, parent_id, medical_notes, medical_confirmed_at').in('id', ids)
    if (r.error) {
      const r2 = await svc.from('students').select('id, parent_id, medical_notes').in('id', ids)
      studs = r2.data || []
    } else studs = r.data || []
  }
  const pids = [...new Set(studs.map(s => s.parent_id).filter(Boolean))]
  let parents: any[] = []
  if (pids.length) {
    const r = await svc.from('parents').select('id, emergency_contact_name, emergency_contact_phone, emergency_contact_relation').in('id', pids)
    if (r.error) {
      const r2 = await svc.from('parents').select('id, emergency_contact_name, emergency_contact_phone').in('id', pids)
      parents = r2.data || []
    } else parents = r.data || []
  }
  const pmap = new Map(parents.map(p => [p.id, p]))
  for (const s of studs) {
    const p: any = pmap.get(s.parent_id)
    out[s.id] = {
      medical: s.medical_notes && String(s.medical_notes).trim() ? String(s.medical_notes).trim() : null,
      answered: !!s.medical_confirmed_at || !!(s.medical_notes && String(s.medical_notes).trim()),
      contact: p?.emergency_contact_name && p?.emergency_contact_phone
        ? { name: p.emergency_contact_name, relation: p.emergency_contact_relation || '', phone: p.emergency_contact_phone }
        : null,
    }
  }
  return out
}
