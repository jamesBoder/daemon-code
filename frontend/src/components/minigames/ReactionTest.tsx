import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { haptic } from '../../lib/haptics'
import { MG } from '../../lib/minigame'

export interface ReactionTestResult {
  tapped: { word: string; reactionTimeMs: number }[]
  total: number
}

interface Props {
  words: string[]
  durationMs?: number   // display time per word in ms; default 800ms
  onComplete: (result: ReactionTestResult) => void
}

interface Ripple { x: number; y: number; id: number }
type Phase = 'in' | 'show' | 'out'

const { fadeInMs, fadeOutMs, flashMs, ripple: rippleCfg } = MG.reaction

export function ReactionTest({ words, durationMs = 800, onComplete }: Props) {
  const reduced = useReducedMotion()

  const [idx,     setIdx]     = useState(0)
  const [phase,   setPhase]   = useState<Phase>('in')
  const [flashed, setFlashed] = useState(false)
  const [ripple,  setRipple]  = useState<Ripple | null>(null)

  const tappedRef     = useRef(false)
  const wordStartRef  = useRef(Date.now())
  const resultsRef    = useRef<{ word: string; reactionTimeMs: number }[]>([])
  const doneRef       = useRef(false)
  const timerRef      = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  function advance() {
    if (doneRef.current) return
    const next = idx + 1
    if (next >= words.length) {
      doneRef.current = true
      onCompleteRef.current({ tapped: resultsRef.current, total: words.length })
      return
    }
    tappedRef.current = false
    setIdx(next)
    setPhase('in')
    setFlashed(false)
  }

  useEffect(() => {
    if (doneRef.current) return

    if (reduced) {
      wordStartRef.current = Date.now()
      timerRef.current = setTimeout(advance, durationMs)
      return () => clearTimeout(timerRef.current)
    }

    if (phase === 'in') {
      wordStartRef.current = Date.now()
      timerRef.current = setTimeout(() => setPhase('show'), fadeInMs)
      return () => clearTimeout(timerRef.current)
    }
    if (phase === 'show') {
      timerRef.current = setTimeout(() => setPhase('out'), durationMs)
      return () => clearTimeout(timerRef.current)
    }
    if (phase === 'out') {
      timerRef.current = setTimeout(advance, fadeOutMs)
      return () => clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase, reduced, durationMs])

  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    if (doneRef.current || tappedRef.current || phase === 'out') return
    tappedRef.current = true
    clearTimeout(timerRef.current)
    haptic('tap')

    const reactionMs = Date.now() - wordStartRef.current
    resultsRef.current = [...resultsRef.current, { word: words[idx], reactionTimeMs: reactionMs }]

    const rect = e.currentTarget.getBoundingClientRect()
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: Date.now() })

    setFlashed(true)
    setTimeout(() => {
      if (doneRef.current) return
      advance()
    }, flashMs)
  }

  const progress      = words.length > 0 ? idx / words.length : 0
  const targetOpacity = reduced ? 1 : (phase === 'out' ? 0 : 1)
  const half          = rippleCfg.size / 2

  return (
    <div
      onClick={handleTap}
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none', WebkitUserSelect: 'none',
        cursor: 'default', overflow: 'hidden',
      }}
    >
      <motion.span
        key={idx}
        initial={{ opacity: 0 }}
        animate={{ opacity: targetOpacity }}
        transition={{
          duration: reduced ? 0 : (phase === 'out' ? fadeOutMs / 1000 : fadeInMs / 1000),
          ease: 'easeInOut',
        }}
        style={{
          fontFamily: MG.type.word.family,
          fontSize:   MG.type.word.size,
          color:      flashed ? 'var(--accent)' : 'var(--text-primary)',
          transition: `color ${MG.reaction.flashTransition}`,
          pointerEvents: 'none',
        }}
      >
        {words[idx]}
      </motion.span>

      <AnimatePresence>
        {ripple && (
          <motion.div
            key={ripple.id}
            initial={{ scale: 0, opacity: 0.4 }}
            animate={{ scale: rippleCfg.scale, opacity: 0 }}
            exit={{}}
            transition={{ duration: rippleCfg.durationS, ease: 'easeOut' }}
            onAnimationComplete={() => setRipple(null)}
            style={{
              position: 'absolute',
              left: ripple.x - half, top: ripple.y - half,
              width: rippleCfg.size, height: rippleCfg.size,
              borderRadius: '50%',
              background: 'var(--accent)',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: MG.reaction.progressHeight, background: 'var(--border)' }}>
        <motion.div
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: MG.reaction.progressAnimS }}
          style={{ height: '100%', background: 'var(--accent)' }}
        />
      </div>
    </div>
  )
}
