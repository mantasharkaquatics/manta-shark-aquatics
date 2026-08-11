'use client'

import { useEffect, useRef, useState } from 'react'

export type Capture = { blob: Blob; seconds: number; language: 'zh' | 'en' }

type Props = {
  studentName: string
  defaultLanguage: 'zh' | 'en'
  disabled?: boolean
  // Handed up rather than submitted here: progress and the recording go to the
  // server together in one action, so this component only captures.
  onChange: (capture: Capture | null) => void
}

type Phase = 'idle' | 'recording' | 'review' | 'error'

// iPad Safari records audio/mp4; Chrome and Firefox prefer webm. Ask the browser
// instead of assuming, or Safari quietly produces a file nothing can read.
function pickMimeType(): string | undefined {
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type
  }
  return undefined
}

export default function LessonNoteCapture({
  studentName, defaultLanguage, disabled, onChange,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [language, setLanguage] = useState<'zh' | 'en'>(defaultLanguage)
  const [seconds, setSeconds] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  const reset = () => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    setAudioUrl(null)
    chunksRef.current = []
    setSeconds(0)
    setMessage('')
    setPhase('idle')
    onChange(null)
  }

  const start = async () => {
    setMessage('')
    try {
      // The whole of our noise handling: OS level, free, no added latency.
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
        const url = URL.createObjectURL(blob)
        urlRef.current = url
        setAudioUrl(url)
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setPhase('review')
        setSeconds(s => { onChange({ blob, seconds: s, language }); return s })
      }
      recorder.start()
      recorderRef.current = recorder

      setSeconds(0)
      tickRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
      setPhase('recording')
    } catch {
      setMessage('Could not open the microphone. Check this site has permission.')
      setPhase('error')
    }
  }

  const stop = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    recorderRef.current?.stop()
    recorderRef.current = null
  }

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <div className="bg-[#0d1529] rounded-xl border border-[#1e3a6e] p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-gray-500 text-xs uppercase tracking-wider">Lesson Note</p>
        {phase === 'idle' && (
          <div className="inline-flex rounded-lg overflow-hidden border border-[#1e3a6e]">
            {(['en', 'zh'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                disabled={disabled}
                className={`px-3 py-1 text-xs font-bold disabled:opacity-40 ${
                  language === l ? 'bg-[#c9a84c] text-[#1a2744]' : 'bg-transparent text-gray-400'
                }`}
              >
                {l === 'en' ? 'English' : 'Chinese'}
              </button>
            ))}
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <button
          onClick={start}
          disabled={disabled}
          className="w-full bg-[#c9a84c] hover:opacity-90 disabled:opacity-40 text-[#1a2744] font-semibold py-3 rounded-lg text-sm"
        >
          ● Record a note for {studentName}
        </button>
      )}

      {phase === 'recording' && (
        <div>
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-xl font-mono">{mmss}</span>
          </div>
          <button
            onClick={stop}
            className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-lg text-sm"
          >
            ■ Stop
          </button>
        </div>
      )}

      {phase === 'review' && (
        <div className="space-y-2">
          {audioUrl && <audio controls src={audioUrl} className="w-full" />}
          <div className="flex items-center justify-between">
            <span className="text-green-400 text-xs">✓ Recorded {mmss}</span>
            <button
              onClick={reset}
              disabled={disabled}
              className="text-xs text-gray-400 hover:text-white border border-[#1e3a6e] px-3 py-1.5 rounded-lg disabled:opacity-40"
            >
              Re-record
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-2">
          <p className="text-red-400 text-xs text-center">{message}</p>
          <button
            onClick={reset}
            className="w-full bg-[#1e3a6e] hover:bg-[#2a4d8f] text-white font-semibold py-2 rounded-lg text-xs"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
