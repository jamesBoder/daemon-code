import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { copy } from '../../lib/copy'
import { LETTER_SPACING_WIDE } from '../../lib/constants'
import { MG } from '../../lib/minigame'

export interface OddOneOutQuote {
  id:   string
  text: string
}

interface Props {
  quotes:     OddOneOutQuote[]
  outlierId:  string
  onComplete: (responseData: unknown) => void
}

type Phase = 'pick' | 'reveal'

const O = MG.oddOneOut

// The Odd One Out — five of the user's own past Weighted Scale leans, shown
// back as quotes pulled from a case file. Four share a real dimension; one
// doesn't. Medium-liberty identity: an evidence board, not a normal choice
// list — quotes sit like pinned exhibits with a slight per-card tilt, mono
// type, faint redaction-bar texture on the untapped state.
export function OddOneOut({ quotes, outlierId, onComplete }: Props) {
  const reduced = useReducedMotion()

  const [phase, setPhase]         = useState<Phase>('pick')
  const [chosenId, setChosenId]   = useState<string | null>(null)
  const mountTimeRef              = useRef(0)
  useEffect(() => { mountTimeRef.current = Date.now() }, [])
  const onCompleteRef             = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  function handlePick(id: string) {
    if (phase !== 'pick') return
    setChosenId(id)
  }

  // Both Date.now() reads and the two-stage timer chain live in effects
  // triggered by state, not the click handler itself — this codebase's
  // react-hooks lint flags impure calls in plain component-scope functions
  // (see DaemonOrb.tsx/SpeedRound.tsx for the same fix applied earlier).
  useEffect(() => {
    if (chosenId === null) return
    const t = setTimeout(() => setPhase('reveal'), reduced ? 0 : O.revealDelayMs)
    return () => clearTimeout(t)
  }, [chosenId, reduced])

  useEffect(() => {
    if (phase !== 'reveal' || chosenId === null) return
    const responseTimeMs = Date.now() - mountTimeRef.current
    const correct = chosenId === outlierId
    const t = setTimeout(() => {
      onCompleteRef.current({ chosen_id: chosenId, correct, response_time_ms: responseTimeMs })
    }, reduced ? 0 : O.revealHoldMs)
    return () => clearTimeout(t)
  }, [phase, chosenId, outlierId, reduced])

  const correct = chosenId === outlierId

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-8)', gap: 'var(--space-5)',
      userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE,
        textAlign: 'center', maxWidth: O.maxW,
      }}>
        {copy.oddOneOut.intro}
      </p>

      <div style={{ width: '100%', maxWidth: O.maxW, display: 'flex', flexDirection: 'column', gap: O.cardGap }}>
        {quotes.map((q, i) => {
          const isChosen    = chosenId === q.id
          const isOutlier   = phase === 'reveal' && q.id === outlierId
          const isDimmed    = phase === 'reveal' && !isChosen && !isOutlier
          // A faint fixed per-card tilt — pinned-to-a-corkboard, not a grid.
          const tilt = [-1.2, 0.8, -0.5, 1.4, -0.9][i % 5]
          return (
            <motion.button
              key={q.id}
              onClick={() => handlePick(q.id)}
              disabled={phase !== 'pick'}
              whileTap={phase === 'pick' ? { scale: O.tapScale } : {}}
              animate={{
                opacity: isDimmed ? 0.4 : 1,
                rotate: reduced ? 0 : tilt,
                borderColor: isOutlier
                  ? 'var(--compile-green)'
                  : (isChosen && phase === 'reveal' && !correct)
                    ? 'var(--warning)'
                    : 'var(--border-glass)',
                boxShadow: isOutlier
                  ? '0 0 20px color-mix(in srgb, var(--compile-green) 35%, transparent)'
                  : (isChosen && phase === 'reveal' && !correct)
                    ? '0 0 20px color-mix(in srgb, var(--warning) 35%, transparent)'
                    : '0 0 0px transparent',
              }}
              transition={{
                opacity: { duration: reduced ? 0 : O.revealFadeS },
                borderColor: { duration: (O.commitFlashMs) / 1000 },
                boxShadow: { duration: (O.commitFlashMs) / 1000 },
              }}
              className="glass-card"
              style={{
                width: '100%', minHeight: O.cardMinH,
                padding: 'var(--space-4) var(--space-5)',
                display: 'flex', alignItems: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
                lineHeight: 'var(--leading-sm)',
                color: 'var(--text-primary)', textAlign: 'left',
                background: 'transparent',
                borderWidth: '0.5px', borderStyle: 'solid',
                borderRadius: 'var(--radius-lg)',
                cursor: phase === 'pick' ? 'pointer' : 'default',
              }}
            >
              &ldquo;{q.text}&rdquo;
            </motion.button>
          )
        })}
      </div>

      <AnimatePresence>
        {phase === 'reveal' && (
          <motion.p
            initial={{ opacity: 0, scale: reduced ? 1 : 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduced ? 0 : O.revealFadeS }}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
              color: correct ? 'var(--compile-green)' : 'var(--text-secondary)',
              textAlign: 'center', maxWidth: O.maxW,
            }}
          >
            {correct ? copy.oddOneOut.correct : copy.oddOneOut.incorrect}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
