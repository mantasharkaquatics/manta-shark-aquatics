// Safety information a family gives the school (owner, 2026-10-22).
//
//  - Per swimmer: "no known medical conditions or allergies", or what they are.
//    students.medical_notes holds the text (null = none); medical_confirmed_at
//    says the question was answered at all. A swimmer with no answer yet is
//    "missing" and the family is asked on the dashboard until it is given.
//  - Per swimmer, optional: learning or sensory needs -- how to talk with
//    the child, what upsets them, what helps them settle (owner, 2026-11-05,
//    決定 7 選項 A: an autistic child's needs had to go under "illness" and
//    were labelled 健康). students.support_notes (null = nothing written);
//    no diagnosis asked. Same readers as the medical notes.
//  - Per family: one emergency contact who is not the parent on the account
//    (parents.emergency_contact_name / _relation / _phone).
//
// Coaches see both for the swimmers in their lessons (app/coach), the desk on
// Members. The waiver says the family disclosed medical conditions at
// registration; this is where that happens.
//
// Client-safe: validation only, no server imports.

export const MEDICAL_MAX = 1000
export const SUPPORT_MAX = 1000
export const CONTACT_NAME_MAX = 100
export const RELATION_MAX = 40

/* none: true = no known conditions, false = notes below, null = not
   answered yet (the needs box may be filled first). support: the optional
   learning / sensory needs, kept with the medical answer because the two
   are asked together. */
export type MedicalAnswer = { none: boolean | null; notes: string; support?: string }
export type EmergencyContact = { name: string; relation: string; phone: string }

/** Digits only, US numbers without the leading 1. */
export function phoneDigits(raw: string): string {
  const d = String(raw || '').replace(/\D/g, '')
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
}

/** The swimmer's answer as stored: null for "none", the text otherwise.
 *  undefined when the answer is not usable (neither box, or "has" with no text). */
/** Which answer is past its limit, if any (14-role test 2, J114: the extra
    was cut off without a word). */
export function safetyTooLong(a: { notes?: unknown; support?: unknown } | null | undefined): 'notes' | 'support' | null {
  if (!a) return null
  if (typeof a.notes === 'string' && a.notes.trim().length > MEDICAL_MAX) return 'notes'
  if (typeof a.support === 'string' && a.support.trim().length > SUPPORT_MAX) return 'support'
  return null
}
export function medicalToStore(a: Partial<MedicalAnswer> | null | undefined): string | null | undefined {
  if (!a) return undefined
  if (a.none === true) return null
  const notes = typeof a.notes === 'string' ? a.notes.trim().slice(0, MEDICAL_MAX) : ''
  return notes ? notes : undefined
}

/** The optional learning / sensory needs as stored: null when empty;
 *  undefined when the request did not send them (left as they are). */
export function supportToStore(a: { support?: unknown } | null | undefined): string | null | undefined {
  if (!a || a.support === undefined) return undefined
  const s = typeof a.support === 'string' ? a.support.trim().slice(0, SUPPORT_MAX) : ''
  return s || null
}

export type ContactProblem = 'name' | 'relation' | 'phone' | 'same_as_parent'

/** Why an emergency contact cannot be saved, or null when it can. */
export function contactProblem(c: Partial<EmergencyContact> | null | undefined, parentPhone?: string | null): ContactProblem | null {
  // Only strings count: anything else is a missing answer, not a crash (J113).
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const name = str(c?.name).trim()
  const relation = str(c?.relation).trim()
  const phone = phoneDigits(str(c?.phone))
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
