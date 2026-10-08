// Deterministic checks on what the parent chat assistant is about to say.
// No imports, so scripts/chat-guard-check.mjs can load this file on its own.
//
// claimsCompletedCancellation: does the reply tell the family that a lesson
// WAS cancelled or refunded just now? app/api/chat/ai-reply swaps such a reply
// for a "nothing was changed" notice when no cancel_booking succeeded in that
// turn.
//
// It used to look for the bare words (cancelled, refunded, 取消了, ...), so the
// ordinary answer to "what is your cancellation policy?" or "can I get my
// unused points refunded?" -- which cannot be written without those words --
// was replaced with "I was not able to complete that cancellation" and sent to
// the desk as a handoff (found 2026-10-08). Owner's rule: only a claim that a
// specific lesson was cancelled or refunded is stopped; a policy explanation
// in English or Chinese passes untouched. So this matches completed-action
// phrasing only ("has been cancelled", "I've cancelled", "已為您取消",
// "點數已退回"), and skips it inside a condition ("if a lesson has been
// cancelled by the school..."), a relative clause ("a lesson that was
// cancelled...") or a negation ("nothing has been cancelled", "未取消").

const EN_CLAIMS: RegExp[] = [
  // I cancelled / I've cancelled / I have just gone ahead and cancelled / I refunded
  /\bI(?:'ve|\s+have)?\s+(?:(?:just|now|already|successfully|gone\s+ahead\s+and|went\s+ahead\s+and)\s+)*(?:cancell?ed|refunded)\b/gi,
  // has/have (now|just|already|successfully) been cancelled / refunded / returned
  /\b(?:has|have)\s+(?:(?:now|just|already|successfully)\s+)*been\s+(?:(?:successfully|fully)\s+)?(?:cancell?ed|refunded|returned)\b/gi,
  // was/were (successfully|just) cancelled / refunded
  /\b(?:was|were)\s+(?:(?:successfully|just|already|fully)\s+)?(?:cancell?ed|refunded)\b/gi,
  // is/are now cancelled
  /\b(?:is|are)\s+now\s+(?:cancell?ed|refunded)\b/gi,
  // successfully cancelled / refunded
  /\bsuccessfully\s+(?:cancell?ed|refunded)\b/gi,
  // the cancellation / refund is complete / went through
  /\b(?:cancell?ation|refund)\s+(?:is|was|has\s+been)\s+(?:now\s+)?(?:complete|completed|successful|done|confirmed|processed)\b/gi,
  /\b(?:cancell?ation|refund)\s+went\s+through\b/gi,
]

// Simplified and Traditional side by side.
const ZH_CLAIMS: RegExp[] = [
  // 已取消 / 已經取消 / 已为您取消 / 已幫您成功取消 / 已退款 / 已退回 / 已退還 -- but not
  // 已取消的課 ("a cancelled lesson", a description) or 已取消或...
  /已(?:經|经)?(?:為您|为您|幫您|帮您|替您|給您|给您)?(?:成功)?(?:取消|退款|退回|退還|退还)(?![的或、])/g,
  // 為您取消了 / 幫您退回了 / 我取消了
  /(?:為您|为您|幫您|帮您|替您|給您|给您|我)(?:成功)?(?:取消|退款|退回|退還|退还)了/g,
  // 取消成功 / 退款成功 / 已完成取消
  /(?:取消|退款)成功/g,
  /已(?:經|经)?完成(?:取消|退款)/g,
]

const SENTENCE_END = /[.!?。！？\n]/

// Words that, earlier in the same sentence, make the match hypothetical.
const EN_CONDITION = /\b(?:if|when|whenever|once|unless|in\s+case|suppose|supposing)\b/i
const ZH_CONDITION = /(?:如果|若是|若|假如|要是|一旦|萬一|万一|只要|假設|假设)/
// Immediately before the match: a relative clause or a negative subject.
const EN_BEFORE = /(?:\b(?:that|which|who|nothing|none|never)\s+(?:\S+\s+){0,1}|\bno\s+(?:lesson|lessons|booking|bookings|class|classes|points)\s+)$/i
const ZH_NEGATION = /(?:沒|没|未|不|尚未|還沒|还没|無法|无法|沒有|没有|不能|未能|沒能|没能)$/

function sentenceStart(text: string, at: number): number {
  for (let i = at - 1; i >= 0; i--) if (SENTENCE_END.test(text[i])) return i + 1
  return 0
}

export function claimsCompletedCancellation(text: string): boolean {
  const s = String(text || '')
  for (const re of EN_CLAIMS) {
    re.lastIndex = 0
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const before = s.slice(sentenceStart(s, m.index), m.index)
      if (EN_CONDITION.test(before)) continue
      if (EN_BEFORE.test(before)) continue
      // "has not been cancelled" never matches; "hasn't" neither.
      return true
    }
  }
  for (const re of ZH_CLAIMS) {
    re.lastIndex = 0
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const before = s.slice(sentenceStart(s, m.index), m.index)
      if (ZH_CONDITION.test(before)) continue
      if (ZH_NEGATION.test(before)) continue
      return true
    }
  }
  return false
}
