import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DaemonOrb } from './DaemonOrb'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import {
  LETTER_SPACING_TIGHT,
  NAMING_CEREMONY_EXIT_MS,
  NAMING_CEREMONY_HOLD_MS,
  REDUCED_MOTION_DURATION,
} from '../../lib/constants'
import type { OrbState } from '../../types'

const ANIM = {
  overlayIn:   0.35,
  nameDelay:   0.55,
  nameDur:     0.55,
  nameExitDur: 0.30,
}

interface NamingCeremonyProps {
  names:      string[]
  orbState:   OrbState
  onComplete: () => void
}

export function NamingCeremony({ names, orbState, onComplete }: NamingCeremonyProps) {
  const [idx,     setIdx]     = useState(0)
  const [exiting, setExiting] = useState(false)
  const reduced               = useReducedMotion()
  const calledComplete        = useRef(false)

  function advance() {
    if (idx < names.length - 1) {
      setIdx(i => i + 1)
    } else {
      setExiting(true)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (idx < names.length - 1) {
        setIdx(i => i + 1)
      } else {
        setExiting(true)
      }
    }, reduced ? 800 : NAMING_CEREMONY_HOLD_MS)
    return () => clearTimeout(t)
  }, [idx, names.length, reduced])

  useEffect(() => {
    if (!exiting || calledComplete.current) return
    calledComplete.current = true
    const t = setTimeout(onComplete, reduced ? 0 : NAMING_CEREMONY_EXIT_MS)
    return () => clearTimeout(t)
  }, [exiting, onComplete, reduced])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: reduced ? REDUCED_MOTION_DURATION : exiting ? NAMING_CEREMONY_EXIT_MS / 1000 : ANIM.overlayIn }}
      onClick={exiting ? undefined : advance}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-8)',
        background: 'var(--background)',
        cursor: 'pointer',
        padding: 'var(--space-8)',
      }}
    >
      <DaemonOrb state={orbState} size={200} namePulse={!exiting && !reduced} />

      <AnimatePresence mode="wait">
        <motion.p
          key={idx}
          variants={{
            enter: {
              opacity: 1, y: 0,
              transition: reduced
                ? { duration: REDUCED_MOTION_DURATION }
                : { duration: ANIM.nameDur, ease: 'easeOut', delay: ANIM.nameDelay },
            },
            exit: {
              opacity: 0, y: reduced ? 0 : -10,
              transition: reduced
                ? { duration: 0 }
                : { duration: ANIM.nameExitDur, ease: 'easeIn' },
            },
          }}
          initial={{ opacity: 0, y: reduced ? 0 : 20 }}
          animate="enter"
          exit="exit"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-3xl)',
            lineHeight: 'var(--leading-3xl)',
            fontWeight: 300,
            color: 'var(--accent)',
            letterSpacing: LETTER_SPACING_TIGHT,
            textAlign: 'center',
            wordBreak: 'break-word',
            maxWidth: 360,
            textShadow: reduced ? 'none' : '0 0 40px var(--accent)',
          }}
        >
          {names[idx]}
        </motion.p>
      </AnimatePresence>

      {names.length > 1 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {names.map((_, i) => (
            <div
              key={i}
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: i === idx ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}
