/* What this device keeps for the signed-in family, cleared when they sign
   out (14-role test 2, J06: the chat draft, the swimmers' check-in codes and
   the calendar's device code stayed for whoever signed in next). Settings
   that belong to the device, not the account -- the language, the swimmer
   spin hint -- stay. Never throws. */
import { forgetFamilyRole } from '@/lib/my-parent'

const SESSION_KEYS = ['msa_chat_draft', 'msa_chat_open', 'msa_chat_about', 'msa_suggest_draft', 'msa.booking.resume', 'msa.booking.family.resume', 'msa_safety_draft']
const SESSION_PREFIXES = ['msa_scroll:']
const LOCAL_KEYS = ['msa_cal_device', 'msa_cal_card_seen', 'msa_celebrated', 'msa_monthly_seen']
const LOCAL_PREFIXES = ['msa_qr_v1:']

function sweep(store: Storage, keys: string[], prefixes: string[]) {
  for (const k of keys) store.removeItem(k)
  const all: string[] = []
  for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k) all.push(k) }
  for (const k of all) if (prefixes.some(p => k.startsWith(p))) store.removeItem(k)
}

export function clearAccountData() {
  try { sweep(window.sessionStorage, SESSION_KEYS, SESSION_PREFIXES) } catch {}
  try { sweep(window.localStorage, LOCAL_KEYS, LOCAL_PREFIXES) } catch {}
  forgetFamilyRole()
}
