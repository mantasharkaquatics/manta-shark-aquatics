'use client'
import { useT } from '@/lib/i18n/provider'

import { useEffect, useRef, useState } from 'react'

export type Capture = { blob: Blob; seconds: number; language: 'zh-Hant' | 'en' }

type Props = {
  studentName: string
  defaultLanguage: 'zh-Hant' | 'en'
  disabled?: boolean
  // Handed up rather than submitted here: progress and the recording go to the
  // server together in one action, so this component only captures.
  onChange: (capture: Capture | null) => void
  /** The take the parent is still holding for this card, shown again when the
   *  card is reopened (a coach moving between swimmers in a 1-on-4). */
  initial?: Capture | null
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

/* One player URL per take, however many times its card is reopened. A take
   now outlives the recorder (see the cleanup below), so its URL does too: it is
   revoked when the coach throws the take away, not when the card closes. */
const takeUrls = new WeakMap<Blob, string>()
function urlFor(blob: Blob): string {
  let url = takeUrls.get(blob)
  if (!url) { url = URL.createObjectURL(blob); takeUrls.set(blob, url) }
  return url
}

export default function LessonNoteCapture({
  studentName, defaultLanguage, disabled, onChange, initial,
}: Props) {
  const [phase, setPhase] = useState<Phase>(initial ? 'review' : 'idle')
  const t = useT()
  const [language, setLanguage] = useState<'zh-Hant' | 'en'>(initial?.language ?? defaultLanguage)
  const [seconds, setSeconds] = useState(initial?.seconds ?? 0)
  const [audioUrl, setAudioUrl] = useState<string | null>(() => initial ? urlFor(initial.blob) : null)
  const [message, setMessage] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const urlRef = useRef<string | null>(audioUrl)
  // Kept in step with the seconds state so onstop can read the elapsed time
  // directly. Reading it through a setSeconds updater instead would call
  // onChange during React's render phase, which updates the parent mid-render.
  const secondsRef = useRef(initial?.seconds ?? 0)

  // The latest onChange, for the unmount cleanup below (which runs once).
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      /* A finished take outlives the recorder (found 2026-10-05). Only one card
         is open at a time, so in a 1-on-4 opening swimmer B's card closed A's,
         and dropping A's take here meant the coach recorded A's note again or
         left it unsent. The parent keeps it and hands it back as `initial`, so
         the recorder reopens showing exactly what Send would upload. A take
         still being RECORDED is dropped: its onstop would otherwise fire after
         this and hand the parent a cut-off clip. */
      if (recorderRef.current) {
        recorderRef.current.onstop = null
        onChangeRef.current(null)
      }
      streamRef.current?.getTracks().forEach(t => t.stop())
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
        const url = urlFor(blob)
        urlRef.current = url
        setAudioUrl(url)
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setPhase('review')
        onChange({ blob, seconds: secondsRef.current, language })
      }
      recorder.start()
      recorderRef.current = recorder

      secondsRef.current = 0
      setSeconds(0)
      tickRef.current = setInterval(() => {
        secondsRef.current += 1
        setSeconds(secondsRef.current)
      }, 1000)
      setPhase('recording')
    } catch {
      setMessage(t('coach.note.micDenied'))
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
        <p className="text-gray-500 text-xs uppercase tracking-wider">{t('coach.note.title')}</p>
        {phase === 'idle' && (
          <span className="text-gray-500 text-[10px]">{t('coach.note.anyLang')}</span>
        )}
      </div>

      {phase === 'idle' && (
        <button
          onClick={start}
          disabled={disabled}
          className="w-full bg-[#c9a84c] hover:opacity-90 disabled:opacity-40 text-[#1a2744] font-semibold py-3 rounded-lg text-sm"
        >
          {t('coach.note.record', { name: studentName })}
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
            {t('coach.note.stop')}
          </button>
        </div>
      )}

      {phase === 'review' && (
        <div className="space-y-2">
          {audioUrl && <audio controls src={audioUrl} className="w-full" />}
          <div className="flex items-center justify-between">
            <span className="text-green-400 text-xs">{t('coach.note.recorded')} {mmss}</span>
            <button
              onClick={reset}
              disabled={disabled}
              className="text-xs text-gray-400 hover:text-white border border-[#1e3a6e] px-3 py-1.5 rounded-lg disabled:opacity-40"
            >
              {t('coach.note.reRecord')}
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
            {t('coach.note.tryAgain')}
          </button>
        </div>
      )}
    </div>
  )
}
