import { useEffect, useState } from 'react'
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
  // Bloom — how far the blurred light bleeds past the ring (bloomScale, as a
  // multiple of the orb's own size) and how diffuse it looks (bloomBlurPx).
  // Both grow with the relationship stage so "deep" genuinely looks like it's
  // emitting light, not just a brighter flat circle.
  bloomBlurPx: number
  bloomScale: number
}

const orbVisuals: Record<OrbState, OrbVisual> = {
  cold:    { outerOpacity: 0.40, innerScale: 0.42, glowOpacity: 0.14, bloomBlurPx: 8,  bloomScale: 1.15 },
  warming: { outerOpacity: 0.55, innerScale: 0.58, glowOpacity: 0.22, bloomBlurPx: 14, bloomScale: 1.30 },
  running: { outerOpacity: 0.72, innerScale: 0.72, glowOpacity: 0.32, bloomBlurPx: 22, bloomScale: 1.50 },
  deep:    { outerOpacity: 0.90, innerScale: 0.86, glowOpacity: 0.44, bloomBlurPx: 32, bloomScale: 1.75 },
}

// Idle breathing — a slow ambient glow pulse for whenever the orb isn't mid a
// name/compile pulse. Opacity-only, no scale or position change, so per this
// app's reduced-motion rule (brightness pulses always play — only spatial
// drift/sweep/slide gets gated) this runs for every user, unconditionally.
const ORB_BREATHE_S = 5.2
const ORB_BREATHE_LOW = 0.75   // fraction of visual.glowOpacity at the dim point
const ORB_BREATHE_HIGH = 1.30  // fraction of visual.glowOpacity at the bright point

// compilePulse's own flash is a one-shot 0.6s ease-out, not a held state, but
// CompileScreen.tsx never resets the prop back to false after triggering it
// (a pre-existing quirk, harmless before breathing existed) -- so `idle` can't
// trust the raw prop or the orb goes permanently static on that screen after
// the first compile. Track the flash locally instead: it's "active" only for
// its own duration regardless of how long the caller holds the prop true.
const COMPILE_PULSE_S = 0.6

export function DaemonOrb({
  state = 'cold',
  size = 200,
  compilePulse = false,
  namePulse = false,
  layoutId,
}: DaemonOrbProps) {
  const reduced = useReducedMotion()
  const visual = orbVisuals[state]

  // Both transitions run inside setTimeout callbacks (even the "turn on," at
  // 0ms) rather than synchronously in the effect body -- this codebase's
  // react-hooks lint flags a direct setState call at the top of an effect as
  // a cascading-render risk, and (separately) forbids reading/writing refs
  // during render, so the usual "derive from a ref-compared prop" pattern
  // isn't available here either.
  const [compilePulseActive, setCompilePulseActive] = useState(false)
  useEffect(() => {
    if (!compilePulse) return
    const onT  = setTimeout(() => setCompilePulseActive(true), 0)
    const offT = setTimeout(() => setCompilePulseActive(false), COMPILE_PULSE_S * 1000)
    return () => { clearTimeout(onT); clearTimeout(offT) }
  }, [compilePulse])

  // Idle = no event pulse actively playing (independent of reduced-motion —
  // an event pulse that's suppressed under reduced motion still isn't idle,
  // it stays at the flat glowOpacity below, matching prior behavior).
  const idle = !namePulse && !compilePulseActive

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
            : compilePulseActive && !reduced
              ? [visual.glowOpacity, visual.glowOpacity * 3, visual.glowOpacity]
              // Idle case is a flat Framer target — the CSS `animation` below
              // (not Framer's `animate`) does the actual breathing, since it
              // isn't vulnerable to a parent re-render resetting the loop.
              : visual.glowOpacity,
          scale: namePulse && !reduced
            ? [1, 1.3, 1]
            : compilePulseActive && !reduced ? [1, 1.15, 1] : 1,
        }}
        transition={
          namePulse && !reduced
            ? { duration: 1.8, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.3 }
            : compilePulseActive && !reduced
              ? { duration: COMPILE_PULSE_S, ease: 'easeOut' }
              // Idle/settle case: matches the ring and core layers below
              // (reduced ? flat duration : springs.smooth) -- this layer had
              // been left on a flat tween unconditionally, so it settled
              // differently from its two siblings for motion-enabled users.
              : reduced ? { duration: REDUCED_MOTION_DURATION } : springs.smooth
        }
        style={{
          position: 'absolute',
          // Larger than the orb itself so the blur has room to bleed outward
          // instead of clipping at the ring's edge — this is what makes it
          // read as light spilling out, not just a brighter flat gradient.
          inset: `${-(visual.bloomScale - 1) * 50}%`,
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
          filter: `blur(${visual.bloomBlurPx}px)`,
          animation: idle ? `orbBreathe ${ORB_BREATHE_S}s ease-in-out infinite` : undefined,
          ['--orb-breathe-low' as string]:  visual.glowOpacity * ORB_BREATHE_LOW,
          ['--orb-breathe-high' as string]: visual.glowOpacity * ORB_BREATHE_HIGH,
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
