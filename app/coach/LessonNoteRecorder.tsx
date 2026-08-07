'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  studentId: string
  studentName: string
  classSessionId: string
  lessonGroupId: string | null
  sessionDate: string
  defaultLanguage: 'zh' | 'en'
}

type Phase = 'idle' | 'recording' | 'review' | 'sending' | 'sent' | 'error'

// iPad Safari records audio/mp4; Chrome and Firefox prefer webm. Ask for the
// first one the browser actually supports rather than assuming, or Safari
// silently produces a file the transcriber cannot read.
function pickMimeType(): string | undefined {
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type
  }
  return undefined
}

export default function LessonNoteRecorder({
  studentId, studentName, classSessionId, lessonGroupId, sessionDate, defaultLanguage,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [language, setLanguage] = useState<'zh' | 'en'>(defaultLanguage)
  const [seconds, setSeconds] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const blobRef = useRef<Blob | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Switching student mid-recording would otherwise leave the mic live and the
  // previous take half-finished.
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reset = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    blobRef.current = null
    chunksRef.current = []
    setSeconds(0)
    setMessage('')
    setPhase('idle')
  }

  const start = async () => {
    setMessage('')
    try {
      // The three flags below are the whole of our noise handling: they are
      // handled by the OS, cost nothing and add no latency. Pool echo and
      // splashing are what they exist for.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream

      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/mp4' })
        blobRef.current = blob
        setAudioUrl(URL.createObjectURL(blob))
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setPhase('review')
      }
      recorder.start()
      recorderRef.current = recorder

      setSeconds(0)
      tickRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
      setPhase('recording')
    } catch {
      setMessage('Could not open the microphone. Check Safari has permission for this site.')
      setPhase('error')
    }
  }

  const stop = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    recorderRef.current?.stop()
    recorderRef.current = null
  }

  const submit = async () => {
    if (!blobRef.current) return
    setPhase('sending')
    setMessage('')
    try {
      const form = new FormData()
      form.append('audio', blobRef.current, 'note.' + (blobRef.current.type.includes('mp4') ? 'mp4' : 'webm'))
      form.append('student_id', studentId)
      form.append('class_session_id', classSessionId)
      if (lessonGroupId) form.append('lesson_group_id', lessonGroupId)
      form.append('session_date', sessionDate)
      form.append('language', language)
      form.append('seconds', String(seconds))

      const res = await fetch('/api/coach/lesson-note', { method: 'POST', body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      setPhase('sent')
    } catch (err: any) {
      setMessage(err?.message || 'Something went wrong. Please try again.')
      setPhase('error')
    }
  }

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <div className="bg-[#0d1529] rounded-xl border border-[#1e3a6e] p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[#c9a84c] text-xs font-semibold uppercase tracking-wider">Lesson Note</span>

        {/* Per-coach default, overridable for this one recording. */}
        {phase === 'idle' && (
          <div className="inline-flex rounded-lg overflow-hidden border border-[#1e3a6e]">
            {(['en', 'zh'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`px-3 py-1 text-xs font-bold ${
                  language === l ? 'bg-[#c9a84c] text-[#111d38]' : 'bg-transparent text-gray-400'
                }`}
              >
                {l === 'en' ? 'English' : '中文'}
              </button>
            ))}
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <button
          onClick={start}
          className="w-full bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] font-semibold py-4 rounded-lg text-base"
        >
          ● Record note for {studentName}
        </button>
      )}

      {phase === 'recording' && (
        <div>
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-2xl font-mono">{mmss}</span>
          </div>
          <button
            onClick={stop}
            className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-4 rounded-lg text-base"
          >
            ■ Stop
          </button>
        </div>
      )}

      {phase === 'review' && (
        <div className="space-y-3">
          {audioUrl && <audio controls src={audioUrl} className="w-full" />}
          <p className="text-gray-400 text-xs text-center">
            Listen back. Re-record as many times as you like — only what you send is kept.
          </p>
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="flex-1 bg-[#1e3a6e] hover:bg-[#2a4d8f] text-white font-semibold py-3 rounded-lg text-sm"
            >
              Re-record
            </button>
            <button
              onClick={submit}
              className="flex-1 bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] font-semibold py-3 rounded-lg text-sm"
            >
              Send ({mmss})
            </button>
          </div>
        </div>
      )}

      {phase === 'sending' && (
        <p className="text-gray-400 text-sm text-center py-4">Transcribing and writing up…</p>
      )}

      {phase === 'sent' && (
        <div className="text-center py-2">
          <p className="text-green-400 text-sm font-medium">✓ Sent for review</p>
          <p className="text-gray-500 text-xs mt-1">
            The office will check it before {studentName}&apos;s family sees it.
          </p>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-3">
          <p className="text-red-400 text-sm text-center">{message}</p>
          <button
            onClick={reset}
            className="w-full bg-[#1e3a6e] hover:bg-[#2a4d8f] text-white font-semibold py-3 rounded-lg text-sm"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
