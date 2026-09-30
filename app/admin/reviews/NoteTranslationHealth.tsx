'use client'

import { useEffect, useState } from 'react'

// Shows only when something is wrong: approved lesson notes a family may be
// reading untranslated, or in the wrong language. One button repairs them.
// A translation that fails at publish time is otherwise invisible -- the
// family simply sees the coach's original words.
export default function NoteTranslationHealth() {
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const load = () => fetch('/api/admin/note-translations').then(r => r.ok ? r.json() : null)
    .then(j => setCount(j ? Number(j.count) || 0 : null)).catch(() => setCount(null))
  useEffect(() => { load() }, [])

  if (!count && !result) return null

  const fix = async () => {
    setBusy(true); setResult(null)
    try {
      const r = await fetch('/api/admin/note-translations', { method: 'POST' })
      const j = await r.json()
      setResult(j.left === 0
        ? `Fixed ${j.fixed} ${j.fixed === 1 ? 'note' : 'notes'}.`
        : `Fixed ${j.fixed} of ${j.tried}. ${j.left} still missing a translation; try again in a minute.`)
    } catch { setResult('The repair did not finish. Try again in a minute.') }
    setBusy(false)
    load()
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <p className="text-sm text-amber-200">
        {count
          ? `${count} approved lesson ${count === 1 ? 'note is' : 'notes are'} missing a translation, so ${count === 1 ? 'that family reads' : 'those families read'} the coach's original words.`
          : result}
      </p>
      {!!count && (
        <button onClick={fix} disabled={busy}
          className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-[#111d38] disabled:opacity-60">
          {busy ? 'Translating…' : 'Translate now'}
        </button>
      )}
      {!!count && result && <p className="w-full text-xs text-amber-200/80">{result}</p>}
    </div>
  )
}
