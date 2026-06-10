import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { MG } from '../../lib/minigame'

export interface PredictionDuelResult {
  matched: boolean
  duelResponseTimeMs: number
}

interface Props {
  pattern:    string
  prediction: string
  onComplete: (result: PredictionDuelResult) => void
  isEmbedded?: boolean  // when true: relative positioning (for Pulse context)
}

type Phase = 'idle' | 'waiting' | 'reveal'

const { duel: D, type: TY } = MG

const CORRECT_REVEALS = [
  'Predicted correctly. The daemon notes the confirmation.',
  'Expected. The model holds.',
  'Consistent. Logged.',
  'The daemon anticipated this. Pattern confirmed.',
  'Alignment confirmed. Accuracy rising.',
] as const

const WRONG_REVEALS = [
  'New data. The daemon revises.',
  'Deviation logged. The model adjusts.',
  'Unexpected. The daemon is taking note.',
  'Contradiction detected. The daemon is updating.',
  'The daemon was wrong. That is noted.',
] as const

export function PredictionDuel({ pattern: _pattern, prediction, onComplete, isEmbedded = false }: Props) {
  const reduced = useReducedMotion()

  const [phase,   setPhase]   = useState<Phase>('idle')
  const [matched, setMatched] = useState<boolean | null>(null)
  const revealRef             = useRef<string>('')
  // Reset after first paint so the clock starts when the question is visible,
  // not during the route-transition fade-in. Mirrors ReactionTest's wordStartRef pattern.
  const mountTimeRef          = useRef(0)
  useEffect(() => { mountTimeRef.current = Date.now() }, [])
  const onCompleteRef         = useRef(onComplete)
  onCompleteRef.current       = onComplete

  function handleChoice(choice: boolean) {
    if (phase !== 'idle') return
    const duelResponseTimeMs = Date.now() - mountTimeRef.current
    const pool = choice ? CORRECT_REVEALS : WRONG_REVEALS
    revealRef.current = pool[Math.floor(Math.random() * pool.length)]
    setMatched(choice)
    setPhase('waiting')

    setTimeout(() => {
      setPhase('reveal')
      setTimeout(() => {
        onCompleteRef.current({ matched: choice, duelResponseTimeMs })
      }, reduced ? 0 : D.revealMs)
    }, reduced ? 0 : D.pauseMs)
  }

  const accentColor = matched === true ? 'var(--compile-green)' : 'var(--warning)'

  return (
    <div style={{
      ...(isEmbedded ? { position: 'relative' } : { position: 'fixed', inset: 0 }),
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-8)',
      gap: 'var(--space-8)',
    }}>
      {/* Prediction statement */}
      <p style={{
        fontFamily: TY.prompt.family,
        fontSize:   TY.prompt.size,
        lineHeight: 'var(--leading-xl)',
        color:      'var(--text-primary)',
        textAlign:  'center',
        maxWidth:   320,
      }}>
        {prediction}
      </p>

      {/* Reveal text — fades in after the pause */}
      {phase === 'reveal' && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0 : D.revealFadeS }}
          style={{
            fontFamily:    'var(--font-mono)',
            fontSize:      'var(--text-sm)',
            color:         accentColor,
            textAlign:     'center',
            maxWidth:      300,
            letterSpacing: '0.02em',
          }}
        >
          {revealRef.current}
        </motion.p>
      )}

      {/* Choice cards — fade out on reveal */}
      <AnimatePresence>
        {phase !== 'reveal' && (
          <motion.div
            key="options"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : D.revealFadeS }}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', width: '100%', maxWidth: 360 }}
          >
            {([true, false] as const).map((choice) => {
              const isChosen = matched === choice && phase === 'waiting'
              return (
                <motion.button
                  key={String(choice)}
                  onClick={() => handleChoice(choice)}
                  whileTap={phase === 'idle' ? { scale: 0.97 } : {}}
                  disabled={phase !== 'idle'}
                  className="glass-card"
                  style={{
                    width:        '100%',
                    padding:      'var(--space-5) var(--space-6)',
                    fontFamily:   'var(--font-sans)',
                    fontSize:     'var(--text-base)',
                    color:        isChosen ? accentColor : 'var(--text-primary)',
                    textAlign:    'left',
                    cursor:       phase === 'idle' ? 'pointer' : 'default',
                    background:   'transparent',
                    borderRadius: 'var(--radius-lg)',
                    border:       isChosen ? `0.5px solid ${accentColor}` : '0.5px solid rgba(255,255,255,0.07)',
                    boxShadow:    isChosen ? `0 0 16px ${accentColor}30` : undefined,
                    transition:   D.cardTransition,
                  }}
                >
                  {choice ? 'The daemon is right' : 'The daemon was wrong'}
                </motion.button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
