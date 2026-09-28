import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { haptic } from '../../lib/haptics'
import { MG, isDesktop } from '../../lib/minigame'

export interface SpeedRoundResult {
  starter: string
  chosen: string
  responseTimeMs: number
}

export interface SpeedRoundPrompt {
  starter: string
  options: string[]
}

interface Props {
  prompts: SpeedRoundPrompt[]
  onComplete: (results: SpeedRoundResult[]) => void
}

const fadeDuration = MG.speed.crossfadeMs / 1000

export function SpeedRound({ prompts, onComplete }: Props) {
  const reduced = useReducedMotion()

  const [idx, setIdx]       = useState(0)
  const [visible, setVisible] = useState(true)
  // Which option was just tapped — glows briefly through the fade-out so a
  // choice reads as registered, not just pressed (whileTap alone is gone the
  // instant the pointer lifts, before the crossfade even starts).
  const [chosenOption, setChosenOption] = useState<string | null>(null)
  const promptStartRef      = useRef(Date.now())
  const resultsRef          = useRef<SpeedRoundResult[]>([])
  const onCompleteRef       = useRef(onComplete)
  onCompleteRef.current     = onComplete

  const prompt = prompts[idx]

  function handleChoice(chosen: string) {
    haptic('tap')
    setChosenOption(chosen)
    const responseTimeMs = Date.now() - promptStartRef.current
    const next = [...resultsRef.current, { starter: prompt.starter, chosen, responseTimeMs }]
    resultsRef.current = next

    if (idx + 1 >= prompts.length) {
      onCompleteRef.current(next)
      return
    }

    if (reduced) {
      promptStartRef.current = Date.now()
      setIdx(idx + 1)
      setChosenOption(null)
      return
    }

    // Fade out → swap content → fade in
    setVisible(false)
    setTimeout(() => {
      setIdx(idx + 1)
      setVisible(true)
      setChosenOption(null)
      promptStartRef.current = Date.now()
    }, MG.speed.crossfadeMs)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: isDesktop ? MG.space.desktopPad : MG.space.mobilePad,
    }}>
      <motion.div
        animate={{ opacity: visible ? 1 : 0, scale: reduced ? 1 : (visible ? 1 : 0.985) }}
        transition={{ duration: reduced ? 0 : fadeDuration, ease: 'easeInOut' }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          width: '100%',
          maxWidth: isDesktop ? MG.scale.svgDesktopWidth : MG.speed.mobileMaxW,
          gap: isDesktop ? MG.space.desktopGap : MG.space.mobileGap,
        }}
      >
        {/* Progress */}
        <p style={{
          fontFamily: MG.type.mono.family,
          fontSize:   MG.type.mono.size,
          color:      'var(--text-muted)',
          letterSpacing: '0.06em',
        }}>
          {idx + 1} of {prompts.length}
        </p>

        {/* Sentence starter */}
        <p style={{
          fontFamily: MG.type.prompt.family,
          fontSize:   MG.type.prompt.size,
          lineHeight: 'var(--leading-xl)',
          color:      'var(--text-primary)',
          textAlign:  'center',
        }}>
          {prompt.starter}
        </p>

        {/* Option cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', width: '100%' }}>
          {prompt.options.map((option) => (
            <motion.button
              key={option}
              onClick={() => handleChoice(option)}
              whileTap={{ scale: 0.97 }}
              animate={{
                // Both states keep the same two-layer shape (same color
                // tokens, only the blur radii change) so Framer Motion can
                // actually interpolate between them -- a structural mismatch
                // here (e.g. collapsing to a single 'transparent' layer) makes
                // it snap instead of animate, since it can't tween across
                // differently-shaped box-shadow values.
                boxShadow: chosenOption === option
                  ? '0 0 20px var(--accent-glow), 0 0 8px color-mix(in srgb, var(--accent) 40%, transparent)'
                  : '0 0 0px var(--accent-glow), 0 0 0px color-mix(in srgb, var(--accent) 40%, transparent)',
              }}
              // Scoped to boxShadow only -- a top-level `transition` becomes
              // the default for whileTap too, replacing its snappy spring
              // with this slower tween (verified: mid-press scale was stuck
              // near 1 instead of springing toward 0.97).
              transition={{ boxShadow: { duration: reduced ? 0 : fadeDuration } }}
              className="glass-card"
              style={{
                width:       '100%',
                padding:     isDesktop ? 'var(--space-5) var(--space-6)' : 'var(--space-4) var(--space-5)',
                fontFamily:  'var(--font-sans)',
                fontSize:    'var(--text-base)',
                color:       'var(--text-primary)',
                textAlign:   'left',
                cursor:      'pointer',
                background:  'transparent',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              {option}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
