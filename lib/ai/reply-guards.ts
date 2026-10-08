// Deterministic checks on what the parent chat assistant is about to say.
// No imports, so scripts/chat-guard-check.mjs can load this file on its own.
//
// claimsCompletedCancellation: does the reply tell the family that a lesson
// WAS cancelled or refunded just now? app/api/chat/ai-reply swaps such a reply
// for a "nothing was changed" notice when no cancel_booking succeeded in that
// turn. A family told "it's cancelled" when it is not skips a lesson that is
// still booked and loses the points, so this is the last line behind the
// system-prompt rule.
//
// It used to look for the bare words (cancelled, refunded, 取消了, ...), so the
// ordinary answer to "what is your cancellation policy?" or "can I get my
// unused points refunded?" -- which cannot be written without those words --
// was replaced with "I was not able to complete that cancellation" and sent to
// the desk as a handoff (found 2026-10-08). Owner's rule: only a claim that a
// specific lesson was cancelled or refunded is stopped; a policy explanation
// in English or Chinese passes untouched.
//
// The first narrow version then missed the most natural claims ("Your lesson
// is cancelled", "Cancelled!", "points are back", 幫您把…取消了, 課取消了,
// 退回了), so the phrasing list is broad and the exceptions are by context:
//   - a condition or time clause ("if", "once", "after", "as soon as",
//     "before", "by the time", 如果, 一旦, ...) in the same clause, or earlier
//     in the sentence when the sentence names no particular lesson;
//   - a relative clause, negation or modal right before ("a lesson that was
//     cancelled", "nothing has been cancelled", "would have been refunded",
//     沒有取消, 要取消了嗎);
//   - a question ("…取消了嗎？");
//   - for present-tense statements ("is cancelled", "are refunded", 取消了,
//     退回了) only: a generic subject ("a lesson", "any lesson", "lessons") or
//     a policy qualifier ("more than 24 hours", "automatically", "in full",
//     超過, 提前, 全額) -- unless the sentence names a swimmer, a date, a time
//     or "this lesson", in which case it is caught anyway.
// scripts/chat-guard-check.mjs holds the worked cases on both sides.

type Kind = 'done' | 'state'
type Claim = { re: RegExp; kind: Kind }

// ---------- English ----------

const I_WE = String.raw`\b(?:I|we)(?:'ve|’ve|\s+have)?\s+(?:(?:just|now|already|successfully|also|gone\s+ahead\s+and|went\s+ahead\s+and)\s+)*`
const NOT_A_NOUN = String.raw`(?!\s+(?:lessons?|class(?:es)?|bookings?|make-?ups?|sessions?|ones?)\b)`

const EN_CLAIMS: Claim[] = [
  // I cancelled / I've cancelled / we have just gone ahead and cancelled / I refunded
  { kind: 'done', re: new RegExp(I_WE + String.raw`(?:cancell?ed|refunded)\b`, 'gi') },
  // I've added / put / returned the 65 points back to your balance
  { kind: 'done', re: new RegExp(I_WE + String.raw`(?:returned|restored|credited|put|added|given)\b(?=[^.!?\n]{0,50}\b(?:points?|balance|refund|credits?)\b)`, 'gi') },
  // I got that cancelled for you
  { kind: 'done', re: new RegExp(I_WE + String.raw`(?:got|gotten)\s+(?:\S+\s+){0,5}?cancell?ed\b`, 'gi') },
  // I've processed the cancellation / your refund
  { kind: 'done', re: new RegExp(I_WE + String.raw`(?:processed|completed|submitted|issued)\s+(?:the|your|this|that)\s+(?:cancell?ation|refund)`, 'gi') },
  // has/have/'s/'ve (now|just|already|successfully) been cancelled / refunded / returned
  { kind: 'done', re: /(?:\b(?:has|have)\s+|(?:'s|’s|'ve|’ve)\s+)(?:(?:now|just|already|successfully|also|all)\s+)*been\s+(?:(?:successfully|fully|all|now)\s+)?(?:cancell?ed|refunded|returned|credited|restored|added\s+back|put\s+back|given\s+back)\b/gi },
  // was/were (successfully|just) cancelled / refunded
  { kind: 'done', re: /\b(?:was|were)\s+(?:(?:successfully|just|already|fully|now|also)\s+)*(?:cancell?ed|refunded|returned|credited|restored)\b/gi },
  // successfully cancelled / refunded
  { kind: 'done', re: /\bsuccessfully\s+(?:cancell?ed|refunded)\b/gi },
  // the cancellation / refund was completed / has been processed / went through
  { kind: 'done', re: /\b(?:cancell?ation|refund)\s+(?:was|has\s+been)\s+(?:now\s+)?(?:complete|completed|successful|done|confirmed|processed|issued|approved|finali[sz]ed)\b/gi },
  { kind: 'done', re: /\b(?:cancell?ation|refund)\b[^.!?\n]{1,40}?\b(?:has|have)\s+been\s+(?:issued|processed|completed|approved|sent)\b/gi },
  { kind: 'done', re: /\b(?:cancell?ation|refund)\s+(?:went|has\s+gone)\s+through\b/gi },
  // "Cancelled!", "Done, cancelled.", "Lesson on Oct 12: cancelled" -- the word
  // opening a sentence or clause, not "Cancelled lessons are ..."
  { kind: 'done', re: new RegExp(String.raw`(?:(?<=^\s*)|(?<=[.!?。！？\n:—–]\s*)|(?<=\b(?:done|all\s+set|ok(?:ay)?|great|sure|perfect|got\s+it|all\s+good|good\s+news)[\s,!.:—–-]*))(?:cancell?ed|refunded)\b` + NOT_A_NOUN + String.raw`(?!\s+(?:within|inside|more|less|by|before|after|at|in|if|when|once)\b)`, 'gi') },
  // is/are/it's (now|all|officially) cancelled / refunded / returned
  { kind: 'state', re: new RegExp(String.raw`\b(?:is|are|'s|’s|'re|’re)\s+(?:(?:now|all|officially|already|successfully|fully|also|both)\s+)*(?:cancell?ed|refunded|returned|credited|restored)\b` + NOT_A_NOUN, 'gi') },
  // points are back / went back / have gone back (in your balance)
  { kind: 'state', re: /\b(?:points?|balance|credits?|refund)\s+(?:is|are|'re|’re|went|have\s+gone|has\s+gone|have\s+come|has\s+come|came)\s+(?:(?:now|already|all|right|straight|safely)\s+)*back\b/gi },
  // the cancellation / refund is complete / confirmed / on its way
  { kind: 'state', re: /\b(?:cancell?ation|refund)\s+is\s+(?:now\s+)?(?:complete|completed|successful|done|confirmed|through|finali[sz]ed)\b/gi },
  { kind: 'state', re: /\brefund\s+is\s+(?:now\s+)?on\s+(?:its|the)\s+way\b/gi },
]

// A condition or time clause: what follows is hypothetical or a rule.
const EN_CONDITION = /\b(?:if|when|whenever|once|unless|in\s+case|suppose|supposing|after|as\s+soon\s+as|before|by\s+the\s+time|any\s*time|until|till|provided|as\s+long\s+as|in\s+the\s+event|whether|should\s+(?:a|an|the|your|any)\b)\b/i
// Immediately before the match: a relative clause, a negative subject, a modal.
const EN_BEFORE = /(?:\b(?:that|which|who)\s+|\b(?:nothing|none|never|not)\s+(?:\S+\s+)?|\bno\s+(?:lesson|lessons|booking|bookings|class|classes|points)\s+|\b(?:will|would|should|could|might|may|must|can|cannot|won't|wouldn't|to)\s+(?:\S+\s+)?)$/i
// A generic subject: "a lesson", "any lesson", "lessons ...".
const EN_GENERIC = /(?:\b(?:a|an|any|each|every|all)\s+(?:\S+\s+){0,3}?(?:lesson|class|booking|make-?up|session|refund|cancell?ation)s?\b|^\s*(?:(?:and|but|so|also|then)\s+)?(?:lessons|classes|bookings|refunds|make-?ups|cancell?ations|(?:single|group|private|shared)\s+lessons)\b)/i
// A policy qualifier anywhere in the sentence.
const EN_QUALIFIER = /\b(?:more\s+than|less\s+than|within|inside|at\s+least|in\s+advance|ahead\s+of\s+time|\d+\s*-?\s*hours?|automatically|in\s+full|by\s+the\s+school|any\s*time|always|usually|normally|generally|typically)\b/i
// The sentence names a particular lesson: a swimmer, a date, a time, "this lesson".
const EN_SPECIFIC_NAME = /\b[A-Z][a-z]+(?:'s|’s)\s/
const EN_SPECIFIC = /\b(?:jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}(?::\d{2})?\s*[ap]\.?m\b|\b\d{1,2}:\d{2}\b|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|yesterday)(?:'s)?\b|\b(?:this|that)\s+(?:\S+\s+){0,2}?(?:lesson|class|booking|make-?up|session)\b|\b\d+\s+points?\b/i

// ---------- Chinese (Traditional and Simplified side by side) ----------

const ZH_DONE_PARTICLE = '(?:了|囉|啰|咯|嘍|喽|啦)'
const ZH_ACCOUNT = '(?:帳戶|账户|帳號|账号|餘額|余额|戶頭|户头)'

const ZH_CLAIMS: Claim[] = [
  // 已取消 / 已經取消 / 已为您取消 / 已幫您成功取消 / 已經幫您把這節課取消 /
  // 已退款 / 已退回 / 已經回到帳戶 -- but not 已取消的課 ("a cancelled
  // lesson", a description) or 已取消或...
  { kind: 'done', re: /已(?:經|经)?(?:被)?(?:為您|为您|幫您|帮您|替您|給您|给您|成功|順利|顺利|全額|全额|全部|自動|自动|直接|都)*(?:把[^，。！？,.!?]{0,24}?)?(?:取消|退款|退回|退還|退还|退給|退给|加回|返還|返还|歸還|归还|存回|退到|回到|回來|回来)(?![的或、])/g },
  // 取消成功 / 取消完成 / 取消好了 / 退款已完成
  { kind: 'done', re: /(?:取消|退款)(?:已經?|已经)?(?:成功|完成|完畢|完毕|生效|好了|搞定|處理好|处理好)/g },
  // 已完成取消 / 完成退款
  { kind: 'done', re: /(?:已經?|已经)?完成了?(?:取消|退款|退點|退点)/g },
  // 取消了 / 取消掉了 / 取消好了 / 取消囉 (幫您把…取消了, 課取消了)
  { kind: 'state', re: new RegExp('取消(?:掉|好|完)?' + ZH_DONE_PARTICLE, 'g') },
  // 退回了 / 退款了 / 加回您的帳戶了
  { kind: 'state', re: new RegExp('(?:退款|退回|退還|退还|退給|退给|加回|返還|返还|歸還|归还|存回)(?:去|來|来)?(?:到|至|進|进)?(?:(?:您|你)的?)?' + ZH_ACCOUNT + '?(?:裡|里|中|內|内|上)?' + ZH_DONE_PARTICLE, 'g') },
  // 回到您的帳戶了 / 退到帳戶了
  { kind: 'state', re: new RegExp('(?:回到|退到|轉回|转回|存入|加到)(?:(?:您|你)的?)?' + ZH_ACCOUNT + '(?:裡|里|中|內|内|上)?' + ZH_DONE_PARTICLE, 'g') },
  // 點數回來了 / 点数都退回去了
  { kind: 'state', re: /(?:點數?|点数?)(?:已經?|已经)?(?:都|也)?(?:回來|回来|回去|加回去|退回去)了/g },
]

const ZH_CONDITION = /(?:如果|若是|若|假如|要是|一旦|萬一|万一|只要|假設|假设|倘若|如若|每當|每当|每次|凡是|(?<![相適适應应])當(?!然|天|日|地|前|中|初)|(?<![相适应])当(?!然|天|日|地|前|中|初)|等到|在[^，。,]{0,20}(?:之前|以前|之後|之后|以後|以后)|任何時候|任何时候|隨時|随时)/
// Right before the verb: a negation (but not 沒問題 / 不好意思 / 不用擔心 / 不過).
const ZH_NEGATION = /(?:沒有?|没有?|尚未|未能|未|無法|无法|不能|沒能|没能|別|别|不)(?!問題|问题|客氣|客气|好意思|用|過|过|錯|错)[^，。,]{0,8}$/
// Not done yet: an intention or a consequence ("要取消了嗎", "那我就幫您取消了").
const ZH_MODAL = /(?:要|將|将|想|可以|能|打算|準備|准备|需要|會|会|是否|請|请|就|才|便)/
// Right after: a description, a time clause or a question.
const ZH_AFTER = /^\s*(?:的|後|后|以後|以后|之後|之后|時|时|之前|以前|嗎|吗|呢)/
const ZH_QUALIFIER = /(?:超過|超过|以上|以內|以内|之內|之内|小時|小时|提前|全額|全额|自動|自动|一律|任何|每堂|每節|每节|每次|通常|一般)/
const ZH_SPECIFIC = /(?:\d{1,2}\s*[/月]\s*\d{1,2}|[週周]\s*[一二三四五六日天]|星期[一二三四五六日天]|禮拜[一二三四五六日天]|礼拜[一二三四五六日天]|今天|明天|昨天|今晚|\d{1,2}\s*[:：]\s*\d{2}|\d{1,2}\s*[點点](?:半|鐘|钟)|[A-Za-z]{2,}|這堂|这堂|這節|这节|那堂|那節|那节|這門|这门|\d{2,}\s*[點点])/

// ---------- shared ----------

const CLAUSE_SEP = /[,;—–，；：、]|:(?!\d)/

function isSentenceEnd(s: string, i: number): boolean {
  const c = s[i]
  if ('。！？\n'.includes(c)) return true
  if ('.!?'.includes(c)) return i + 1 >= s.length || /\s/.test(s[i + 1])
  return false
}

function sentenceBounds(s: string, from: number, to: number): [number, number] {
  let start = 0
  for (let i = from - 1; i >= 0; i--) if (isSentenceEnd(s, i)) { start = i + 1; break }
  let end = s.length
  for (let i = to; i < s.length; i++) if (isSentenceEnd(s, i)) { end = i + 1; break }
  return [start, end]
}

function lastClause(text: string): string {
  let at = 0
  for (let i = 0; i < text.length; i++) if (CLAUSE_SEP.test(text[i] + (text[i + 1] || ''))) at = i + 1
  return text.slice(at)
}

function firstClause(text: string): { body: string; question: boolean } {
  for (let i = 0; i < text.length; i++) {
    if (CLAUSE_SEP.test(text[i] + (text[i + 1] || ''))) return { body: text.slice(0, i), question: false }
  }
  return { body: text, question: /[?？]\s*$/.test(text) }
}

type Lang = 'en' | 'zh'

function isClaim(s: string, m: RegExpExecArray, kind: Kind, lang: Lang): boolean {
  const mStart = m.index
  const mEnd = m.index + m[0].length
  const [sStart, sEnd] = sentenceBounds(s, mStart, mEnd)
  const sentence = s.slice(sStart, sEnd)
  const before = s.slice(sStart, mStart)
  const clauseBefore = lastClause(before)
  const earlierInSentence = before.slice(0, before.length - clauseBefore.length)
  const after = firstClause(s.slice(mEnd, sEnd))
  const specific = lang === 'en'
    ? EN_SPECIFIC_NAME.test(sentence) || EN_SPECIFIC.test(sentence)
    : ZH_SPECIFIC.test(sentence)

  if (lang === 'en') {
    if (EN_BEFORE.test(before)) return false
    if (after.question) return false
    if (EN_CONDITION.test(clauseBefore)) return false
    if (EN_CONDITION.test(earlierInSentence) && !specific) return false
    if (kind === 'state' && !specific && (EN_GENERIC.test(clauseBefore) || EN_QUALIFIER.test(sentence))) return false
    return true
  }

  if (ZH_AFTER.test(s.slice(mEnd, sEnd))) return false
  if (after.question || /[嗎吗]/.test(after.body)) return false
  if (ZH_NEGATION.test(clauseBefore)) return false
  if (ZH_CONDITION.test(clauseBefore)) return false
  if (ZH_CONDITION.test(earlierInSentence) && !specific) return false
  if (kind === 'state') {
    if (ZH_MODAL.test(clauseBefore) && !/已/.test(clauseBefore)) return false
    if (!specific && ZH_QUALIFIER.test(sentence)) return false
  }
  return true
}

function anyClaim(s: string, claims: Claim[], lang: Lang): boolean {
  for (const { re, kind } of claims) {
    re.lastIndex = 0
    for (let m = re.exec(s); m; m = re.exec(s)) {
      if (m[0].length === 0) { re.lastIndex++; continue }
      if (isClaim(s, m, kind, lang)) return true
    }
  }
  return false
}

export function claimsCompletedCancellation(text: string): boolean {
  const s = String(text || '')
  return anyClaim(s, EN_CLAIMS, 'en') || anyClaim(s, ZH_CLAIMS, 'zh')
}
