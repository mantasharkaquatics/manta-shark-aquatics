// Safety information a family gives the school (owner, 2026-10-22).
//
//  - Per swimmer: "no known medical conditions or allergies", or what they are.
//    students.medical_notes holds the text (null = none); medical_confirmed_at
//    says the question was answered at all. A swimmer with no answer yet is
//    "missing" and the family is asked on the dashboard until it is given.
//  - Per family: one emergency contact who is not the parent on the account
//    (parents.emergency_contact_name / _relation / _phone).
//
// Coaches see both for the swimmers in their lessons (app/coach), the desk on
// Members. The waiver says the family disclosed medical conditions at
// registration; this is where that happens.
//
// Client-safe: validation only, no server imports.

export const MEDICAL_MAX = 1000
export const CONTACT_NAME_MAX = 100
export const RELATION_MAX = 40

export type MedicalAnswer = { none: boolean; notes: string }
export type EmergencyContact = { name: string; relation: string; phone: string }

/** Digits only, US numbers without the leading 1. */
export function phoneDigits(raw: string): string {
  const d = String(raw || '').replace(/\D/g, '')
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
}

/** The swimmer's answer as stored: null for "none", the text otherwise.
 *  undefined when the answer is not usable (neither box, or "has" with no text). */
export function medicalToStore(a: Partial<MedicalAnswer> | null | undefined): string | null | undefined {
  if (!a) return undefined
  if (a.none === true) return null
  const notes = typeof a.notes === 'string' ? a.notes.trim().slice(0, MEDICAL_MAX) : ''
  return notes ? notes : undefined
}

export type ContactProblem = 'name' | 'relation' | 'phone' | 'same_as_parent'

/** Why an emergency contact cannot be saved, or null when it can. */
export function contactProblem(c: Partial<EmergencyContact> | null | undefined, parentPhone?: string | null): ContactProblem | null {
  const name = String(c?.name || '').trim()
  const relation = String(c?.relation || '').trim()
  const phone = phoneDigits(String(c?.phone || ''))
  if (!name || name.length > CONTACT_NAME_MAX) return 'name'
  if (!relation || relation.length > RELATION_MAX) return 'relation'
  if (phone.length !== 10) return 'phone'
  if (parentPhone && phoneDigits(parentPhone) === phone) return 'same_as_parent'
  return null
}

/** (714) 555-0123 for display; anything that is not 10 digits as given. */
export function formatPhone(raw: string | null | undefined): string {
  const d = phoneDigits(String(raw || ''))
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(raw || '')
}
