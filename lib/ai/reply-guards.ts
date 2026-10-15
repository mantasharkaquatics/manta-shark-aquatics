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
// subject: the sentence must also name the assessment or a held time (used by
// the trial-booking claims below, where "is booked" alone is as likely to be
// about an ordinary lesson the family already holds).
type Claim = { re: RegExp; kind: Kind; subject?: boolean }

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

type Extra = (s: string, m: RegExpExecArray, claim: Claim, lang: Lang) => boolean

function firstClaim(s: string, claims: Claim[], lang: Lang, extra?: Extra): Kind | null {
  for (const claim of claims) {
    const { re, kind } = claim
    re.lastIndex = 0
    for (let m = re.exec(s); m; m = re.exec(s)) {
      if (m[0].length === 0) { re.lastIndex++; continue }
      if (isClaim(s, m, kind, lang) && (!extra || extra(s, m, claim, lang))) return kind
    }
  }
  return null
}

function anyClaim(s: string, claims: Claim[], lang: Lang): boolean {
  return firstClaim(s, claims, lang) !== null
}

export function claimsCompletedCancellation(text: string): boolean {
  const s = String(text || '')
  return anyClaim(s, EN_CLAIMS, 'en') || anyClaim(s, ZH_CLAIMS, 'zh')
}

// ---------- trial (Swim Assessment) bookings ----------
//
// trialBookingClaim: does the reply tell the family that a Swim Assessment
// slot WAS booked, reserved or confirmed? app/api/chat/ai-reply swaps such a
// reply for a "nothing was booked" notice when book_trial_pending did not
// succeed in that turn and the database holds no such booking either. A
// family told "it's booked" when it is not turns up for an assessment that
// does not exist.
//
// It used to be one inline regex in the route listing only Traditional forms
// with 已 right before 為/幫, so 已經幫您預約好了, every Simplified claim
// (已为您预约, 预约成功) and the plain English ones ("I've booked Emma's
// assessment", "Your assessment is confirmed") reached the parent unflagged
// (found 2026-10-15). The phrasing list is now broad in all three scripts, and
// the exceptions are the cancellation guard's: negation, modal, condition and
// question context (isClaim above).
//
// Two kinds, because the route checks them against different facts:
//   - 'done': the assistant says it did it ("I've booked", 已為您預約,
//     预约成功). True only if a trial booking was made just now -- this turn,
//     or an earlier turn of the same conversation.
//   - 'state': a description ("the assessment is booked", 時段已保留). True
//     if the family holds an upcoming assessment at all, so "you're welcome,
//     Emma's assessment is booked for Oct 20" on a later turn passes. These
//     need the sentence to name the assessment or a held slot (subject), since
//     "Kayden's Thursday lesson is booked" is an ordinary status answer.
// scripts/chat-guard-check.mjs holds the worked cases.

const EN_TRIAL_SUBJECT = /\b(?:assessments?|evaluations?|slots?|spots?|appointments?|reservations?|trial|holds?)\b/i
const ZH_TRIAL_SUBJECT = /(?:評估|评估|時段|时段|名額|名额|試課|试课|保留)/
// A state that is a rule, not a fact: "the assessment is confirmed once
// payment succeeds", "the slot is reserved for 15 minutes".
const EN_TRIAL_AFTER_RULE = /^\s*(?:only\s+)?(?:once|when|after|if|as\s+soon\s+as|until|upon|for\s+(?:\d+|fifteen|thirty)\s+min)/i
// Availability, not a booking: "all slots on Oct 20 are booked", "that slot
// is already booked by another family".
const EN_TRIAL_TAKEN = /\b(?:fully\s+booked|all\s+(?:\S+\s+){0,3}?(?:slots?|spots?|times?)|no\s+(?:\S+\s+)?(?:slots?|spots?|times?)|by\s+(?:another|someone|other)|already\s+taken|unavailable|not\s+available)\b/i

const EN_BOOK_VERB = String.raw`(?:booked|reserved|held|secured|scheduled|locked\s+in)`
const EN_TRIAL_CLAIMS: Claim[] = [
  // I've booked / we have just reserved / I held the 3:00 PM slot for you
  { kind: 'done', re: new RegExp(I_WE + EN_BOOK_VERB + String.raw`\b`, 'gi') },
  // I've confirmed / set up Emma's assessment
  { kind: 'done', re: new RegExp(I_WE + String.raw`(?:confirmed|set\s+up|arranged)\b(?=[^.!?\n]{0,40}\b(?:assessment|evaluation|slot|spot|appointment|reservation)s?\b)`, 'gi') },
  // I got Emma booked in
  { kind: 'done', re: new RegExp(I_WE + String.raw`(?:got|gotten)\s+(?:\S+\s+){0,4}?(?:booked|reserved|scheduled)\b`, 'gi') },
  // successfully booked / reserved
  { kind: 'done', re: new RegExp(String.raw`\bsuccessfully\s+` + EN_BOOK_VERB + String.raw`\b`, 'gi') },
  // reserved the slot / held your 3:00 PM spot
  { kind: 'done', re: /\b(?:reserved|held|secured|booked)\s+(?:the|this|that|your|a)\s+(?:\S+\s+){0,3}?(?:slot|spot|time)\b/gi },
  // the booking / reservation was successful
  { kind: 'done', re: /\b(?:booking|reservation|assessment)\s+(?:was|is|has\s+been)\s+(?:now\s+)?(?:successful|complete|completed|made)\b/gi },
  // "Booked!", "Done, reserved." -- the word opening a sentence or clause
  { kind: 'done', re: new RegExp(String.raw`(?:(?<=^\s*)|(?<=[.!?。！？\n:—–]\s*)|(?<=\b(?:done|all\s+set|ok(?:ay)?|great|sure|perfect|got\s+it|good\s+news)[\s,!.:—–-]*))(?:booked|reserved)\b` + NOT_A_NOUN + String.raw`(?!\s+(?:slots?|spots?|times?|assessments?|within|inside|more|less|by|before|after|at|in|if|when|once|for\s+\d)\b)`, 'gi') },
  // the assessment is (now) booked / has been confirmed / slot is reserved
  { kind: 'state', subject: true, re: /\b(?:is|are|'s|’s|'re|’re|has\s+been|have\s+been|was|were)\s+(?:(?:now|all|officially|already|successfully|fully|also)\s+)*(?:booked|reserved|confirmed|secured|scheduled)\b/gi },
  // you're all booked / all set for the assessment
  { kind: 'state', subject: true, re: /\byou(?:'re|’re|\s+are)\s+(?:(?:now|all)\s+)*(?:booked|set|confirmed)\b/gi },
]

// 為您 / 幫你 / 为 Emma -- not 因為您 ("because you"), 作為, 成為, 認為, 以為.
const ZH_NAME = '\\s*[A-Za-z][A-Za-z\'’-]*(?:\\s[A-Za-z][A-Za-z\'’-]*)?\\s*'
const ZH_AGENT = '(?<![因作成認认以行])(?:為|为|幫|帮|替|給|给)(?:(?:您|你)(?:的?' + ZH_NAME + ')?|' + ZH_NAME + ')'
const ZH_BA = '(?:把[^，。！？,.!?]{0,24}?)?'
const ZH_BOOK = '(?:保留|預約|预约|預訂|预订|安排|訂好|订好|約好|约好)'
const ZH_TRIAL_CLAIMS: Claim[] = [
  // 已成功預約 / 已經順利為您保留
  { kind: 'done', re: new RegExp('(?<![您你])已(?:經|经)?(?:成功|順利|顺利)地?' + '(?:' + ZH_AGENT + ')?' + ZH_BA + ZH_BOOK + '(?![的或、])', 'g') },
  // 已為您預約 / 已經幫您把 Emma 的評估預約好了 / 已为 Emma 保留
  // (not 您已為 Emma 預約了: "you booked it", a description of the family's own booking)
  { kind: 'done', re: new RegExp('(?<![您你])已(?:經|经)?' + ZH_AGENT + '(?:成功|順利|顺利)?' + ZH_BA + ZH_BOOK + '(?![的或、])', 'g') },
  // 預約成功 / 预约成功 / 保留完成 / 成功預約了
  { kind: 'done', re: /(?:預約|预约|預訂|预订|保留|訂位|订位)(?:已經?|已经)?(?:成功|完成)/g },
  { kind: 'done', re: /成功(?:為您|为您|幫您|帮您)?(?:預約|预约|預訂|预订|保留)(?:了|囉|啰|啦)/g },
  // 幫您預約好了 / 我为您保留了 (no 已)
  { kind: 'state', re: new RegExp(ZH_AGENT + '(?:成功)?' + ZH_BA + ZH_BOOK + '(?:好|完)?(?:了|囉|啰|咯|啦)', 'g') },
  // 時段已保留 / 評估已經預約好了 / 评估已确认 (not 已被預約 / 已預約滿:
  // taken by someone else)
  { kind: 'state', subject: true, re: /已(?:經|经)?(?:保留|預約|预约|預訂|预订|安排)(?:好|妥)?(?![的或、滿满])/g },
  { kind: 'state', subject: true, re: /(?:預約|预约|預訂|预订|保留|安排)(?:好|妥)(?:了|囉|啰|啦)/g },
  { kind: 'state', subject: true, re: /(?:預約|预约|評估|评估|時段|时段)(?:已經?|已经)?(?:確認|确认)(?:了)?(?![的或、嗎吗])/g },
]

function trialExtra(s: string, m: RegExpExecArray, claim: Claim, lang: Lang): boolean {
  const [sStart, sEnd] = sentenceBounds(s, m.index, m.index + m[0].length)
  const sentence = s.slice(sStart, sEnd)
  if (claim.subject && !(lang === 'en' ? EN_TRIAL_SUBJECT : ZH_TRIAL_SUBJECT).test(sentence)) return false
  if (claim.kind === 'state' && lang === 'en' && EN_TRIAL_AFTER_RULE.test(s.slice(m.index + m[0].length, sEnd))) return false
  if (claim.kind === 'state' && lang === 'en' && EN_TRIAL_TAKEN.test(sentence)) return false
  return true
}

// 'done' wins over 'state': the route holds a 'done' claim to the stricter test.
export function trialBookingClaim(text: string): Kind | null {
  const s = String(text || '')
  const doneOnly = (cs: Claim[]) => cs.filter(c => c.kind === 'done')
  const stateOnly = (cs: Claim[]) => cs.filter(c => c.kind === 'state')
  return firstClaim(s, doneOnly(EN_TRIAL_CLAIMS), 'en', trialExtra)
    ?? firstClaim(s, doneOnly(ZH_TRIAL_CLAIMS), 'zh', trialExtra)
    ?? firstClaim(s, stateOnly(EN_TRIAL_CLAIMS), 'en', trialExtra)
    ?? firstClaim(s, stateOnly(ZH_TRIAL_CLAIMS), 'zh', trialExtra)
}

export function claimsTrialBooked(text: string): boolean {
  return trialBookingClaim(text) !== null
}
