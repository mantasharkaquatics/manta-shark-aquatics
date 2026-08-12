'use client'

export type PairedNote = {
  id: string
  transcript: string
  note: string
  language: string
  audio_seconds: number | null
  audio_url: string | null
}

// Sits inside the pending-progress card so the office reviews one lesson, not
// two things that happen to share a date: what was learned and what the coach
// said about it are approved with a single click.
export default function AdminLessonNoteReview({
  note, value, onChange,
}: {
  note: PairedNote
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="mt-4 pt-4 border-t border-[#1e3a6e] space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-wider">Lesson Note</p>
        <span className="text-gray-500 text-xs">
          recorded in {LANGUAGE_LABELS[note.language] || note.language}
          {note.audio_seconds ? ` · ${note.audio_seconds}s` : ''}
        </span>
      </div>

      {note.audio_url && <audio controls src={note.audio_url} className="w-full" />}

      <div>
        <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">What the coach said</p>
        {/* Read-only: this is the record of what was actually spoken, and the
            thing to compare against when the written note reads oddly. */}
        <div className="bg-[#0d1529] rounded-lg p-3 border border-[#1e3a6e]">
          <p className="text-gray-400 text-xs whitespace-pre-wrap">{note.transcript || '—'}</p>
        </div>
      </div>

      <div>
        <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">What the family will read</p>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={4}
          className="w-full bg-[#0d1529] text-white text-xs rounded-lg p-3 border border-[#1e3a6e] focus:border-[#c9a84c] outline-none resize-y"
        />
        <p className="text-gray-600 text-[10px] mt-1">
          Anything the coach did not actually say is worth cutting.
        </p>
      </div>
    </div>
  )
}import { LANGUAGE_LABELS } from '@/lib/ai/models'

