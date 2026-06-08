import { useEffect, useRef, useState } from 'react'
import { SIGNAL_HINTS_KEY, SIGNAL_WHISPER_DISPLAY_MS } from '../lib/constants'

function markSeen(key: string) {
  const seen = JSON.parse(localStorage.getItem(SIGNAL_HINTS_KEY) ?? '[]') as string[]
  if (!seen.includes(key)) {
    localStorage.setItem(SIGNAL_HINTS_KEY, JSON.stringify([...seen, key]))
  }
}

// Fires once when `condition` first becomes true. Shows for SIGNAL_WHISPER_DISPLAY_MS then auto-dismisses.
// Tracks seen hints in localStorage — will never show the same key twice across sessions.
export function useSignalHint(key: string, condition = true) {
  const triggered = useRef(false)
  const [shouldShow, setShouldShow] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!condition || triggered.current) return
    triggered.current = true
    const seen = JSON.parse(localStorage.getItem(SIGNAL_HINTS_KEY) ?? '[]') as string[]
    if (!seen.includes(key)) {
      setShouldShow(true)
    }
  }, [condition, key])

  useEffect(() => {
    if (!shouldShow) return
    timer.current = setTimeout(() => {
      setShouldShow(false)
      markSeen(key)
    }, SIGNAL_WHISPER_DISPLAY_MS)
    return () => clearTimeout(timer.current)
  }, [shouldShow, key])

  function dismiss() {
    clearTimeout(timer.current)
    setShouldShow(false)
    markSeen(key)
  }

  return { shouldShow, dismiss }
}
