import { motion } from 'framer-motion'
import { springs } from '../../lib/springs'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { REDUCED_MOTION_DURATION, ROUTE_TRANSITION_MS } from '../../lib/constants'
import { copy } from '../../lib/copy'
import type { OrbState } from '../../types'

export type { OrbState }

interface DaemonOrbProps {
  state?: OrbState
  size?: number
  signalConfidence?: number
  kernelAccess?: number
  compilePulse?: boolean
  namePulse?: boolean
  layoutId?: string
}

const ORB_INNER_RATIO = 0.5

interface OrbVisual {
  outerOpacity: number
  innerScale: number
  glowOpacity: number
}

const orbVisuals: Record<OrbState, OrbVisual> = {
  cold:    { outerOpacity: 0.40, innerScale: 0.42, glowOpacity: 0.14 },
  warming: { outerOpacity: 0.55, innerScale: 0.58, glowOpacity: 0.22 },
  running: { outerOpacity: 0.72, innerScale: 0.72, glowOpacity: 0.32 },
  deep:    { outerOpacity: 0.90, innerScale: 0.86, glowOpacity: 0.44 },
}

export function DaemonOrb({
  state = 'cold',
  size = 200,
  compilePulse = false,
  namePulse = false,
  layoutId,
}: DaemonOrbProps) {
  const reduced = useReducedMotion()
  const visual = orbVisuals[state]

  return (
    <motion.div
      role="img"
      aria-label={copy.daemonOrb.accessibilityLabel}
      layout={!!layoutId}
      layoutId={layoutId}
      transition={{
        layout: reduced
          ? { duration: REDUCED_MOTION_DURATION }
          : { duration: ROUTE_TRANSITION_MS / 1000, ease: 'easeOut' },
      }}
      style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <motion.div
        animate={{
          opacity: namePulse && !reduced
            ? [visual.glowOpacity, visual.glowOpacity * 5, visual.glowOpacity]
            : compilePulse && !reduced
              ? [visual.glowOpacity, visual.glowOpacity * 3, visual.glowOpacity]
              : visual.glowOpacity,
          scale: namePulse && !reduced
            ? [1, 1.3, 1]
            : compilePulse && !reduced ? [1, 1.15, 1] : 1,
        }}
        transition={reduced
          ? { duration: REDUCED_MOTION_DURATION }
          : namePulse
            ? { duration: 1.8, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.3 }
            : compilePulse
              ? { duration: 0.6, ease: 'easeOut' }
              : springs.smooth
        }
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
        }}
      />
      <motion.div
        animate={{ opacity: visual.outerOpacity }}
        transition={reduced ? { duration: REDUCED_MOTION_DURATION } : springs.smooth}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '0.5px solid var(--border-active)',
          background: 'var(--surface)',
        }}
      />
      <motion.div
        animate={{ scale: visual.innerScale }}
        transition={reduced ? { duration: REDUCED_MOTION_DURATION } : springs.smooth}
        style={{
          width: size * ORB_INNER_RATIO,
          height: size * ORB_INNER_RATIO,
          borderRadius: '50%',
          background: 'var(--background)',
          border: '0.5px solid var(--border-subtle)',
        }}
      />
    </motion.div>
  )
}
