import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { MG } from '../../lib/minigame'

export interface PredictionDuelResult {
  matched: boolean
}

interface Props {
  pattern:    string
  prediction: string
  onComplete: (result: PredictionDuelResult) => void
}

type Phase = 'idle' | 'waiting' | 'reveal'

const { duel: D, type: TY } = MG

export function PredictionDuel({ pattern: _pattern, prediction, onComplete }: Props) {
  const reduced = useReducedMotion()

  const [phase,   setPhase]   = useState<Phase>('idle')
  const [matched, setMatched] = useState<boolean | null>(null)
  const onCompleteRef         = useRef(onComplete)
  onCompleteRef.current       = onComplete

  function handleChoice(choice: boolean) {
    if (phase !== 'idle') return
    setMatched(choice)
    setPhase('waiting')

    setTimeout(() => {
      setPhase('reveal')
      setTimeout(() => {
        onCompleteRef.current({ matched: choice })
      }, reduced ? 0 : D.revealMs)
    }, reduced ? 0 : D.pauseMs)
  }

  const accentColor = matched === true ? 'var(--compile-green)' : 'var(--warning)'
  const revealText  = matched === true
    ? 'Predicted correctly. The daemon notes the confirmation.'
    : 'New data. The daemon revises.'

  return (
    <div style={{
      position: 'fixed', inset: 0,
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
          {revealText}
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
