// Text the model writes for a family (a lesson note, its translation, a
// monthly report) must be the finished text and nothing else.
//
// Found 2026-10-08 in the send-back test: the polish step returned a draft,
// then "Wait - the coach didn't mention ... Let me redo this cleanly.", then a
// second draft, all as one note. The admin sees the coach's note before
// approving, but translations are written AFTER approval and go to families
// unread, so the same slip there would reach a parent.
//
// Two layers: the model is asked to put the finished text between <final>
// tags (and only the last such block is taken, so a first draft followed by a
// corrected one keeps the correction), and text that still reads like the
// model talking to itself is refused. A refused answer counts as a failed
// call: callers retry, then fall back the way they already do on an API
// error (the raw transcript, or no translation).

export const FINAL_TAG_INSTRUCTION =
  'Put the finished text, and nothing else, between <final> and </final>. '
  + 'Do not think out loud or explain. If you change your mind, write only the corrected text inside the tags.'

const META = [
  // "Wait -" opening a sentence; not "couldn't wait to jump in".
  /(^|[.!?]\s+|\n)\s*["']?wait\s*[-–—,:.!]/i,
  /\blet me (redo|rewrite|re-?do|try again|fix|start over|correct)/i,
  /\bi (shouldn't|should not|must not|need to) (assume|invent|add|say|redo|rewrite)/i,
  /\bthe coach (didn't|did not|never) (mention|say|said)/i,
  /\b(here is|here's) (the|a|my) (revised |corrected |final |cleaned[- ]up )?(note|translation|version|text|report)\b/i,
  /\b(revised|corrected|cleaner) version\b/i,
  /<\/?final>/i,
  // Not 等等: in Chinese it is also "etc.".
  /(讓我重|让我重|我不應該|我不应该|重新寫一次|重新写一次|以下是(修改|修正|翻譯|翻译))/,
]

/** True when the text reads like the model's own commentary, not the note. */
export function looksLikeMeta(text: string): boolean {
  return META.some(re => re.test(text))
}

/** The finished text from a model answer, or null when there is none or it
 *  still carries commentary. */
export function finalText(raw: string): string | null {
  const blocks = [...String(raw || '').matchAll(/<final>([\s\S]*?)<\/final>/gi)]
  if (blocks.length === 0) return null
  const text = blocks[blocks.length - 1][1].trim()
  if (!text || looksLikeMeta(text)) return null
  return text
}
