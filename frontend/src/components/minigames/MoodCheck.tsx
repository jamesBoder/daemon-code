import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { DaemonOrb } from '../daemon/DaemonOrb'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { copy } from '../../lib/copy'
import { LETTER_SPACING_WIDE } from '../../lib/constants'
import { MG } from '../../lib/minigame'
import type { OrbState } from '../../types'

interface Props {
  /** Called with the committed 1–5 score after the acknowledgement beat. */
  onSelect: (score: number) => void
}

type Phase = 'pick' | 'ack'

const { mood: M, track: T, type: TY, spring: SPR } = MG

// Component-specific mappings — orb response and ack bucket per score.
const MOOD = {
  orbStates: ['cold', 'warming', 'warming', 'running', 'deep'] as OrbState[], // index = score - 1
  ackBucket: (score: number): 'low' | 'mid' | 'high' =>
    score <= 2 ? 'low' : score === 3 ? 'mid' : 'high',
} as const

function pick<Item>(pool: readonly Item[]): Item {
  return pool[Math.floor(Math.random() * pool.length)]
}

export function MoodCheck({ onSelect }: Props) {
  const reduced = useReducedMotion()

  const [phase, setPhase] = useState<Phase>('pick')
  const [score, setScore] = useState(Math.ceil((M.scoreMin + M.scoreMax) / 2))
  const [dragMax, setDragMax] = useState(M.dragMaxFallback)
  const [prompt] = useState(() => pick(copy.mood.prompts))
  const [ack, setAck] = useState('')
  const trackRef  = useRef<HTMLDivElement>(null)
  const ackTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // If the user exits the session during the ack beat, the pending onSelect
  // would post the mood and navigate to /session/complete from wherever they
  // landed — clear it on unmount.
  useEffect(() => () => clearTimeout(ackTimer.current), [])

  useLayoutEffect(() => {
    if (!trackRef.current) return
    const w = trackRef.current.getBoundingClientRect().width
    setDragMax(Math.floor(w / 2) - T.edgeInset)
  }, [])

  const dragX = useMotionValue(0)
  const value = useTransform(dragX, [-dragMax, dragMax], [0, 1])

  function scoreFromValue(v: number): number {
    const span = M.scoreMax - M.scoreMin
    return M.scoreMin + Math.round(Math.max(0, Math.min(1, v)) * span)
  }

  function syncScore() {
    setScore(scoreFromValue(value.get()))
  }

  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect    = e.currentTarget.getBoundingClientRect()
    const cx      = rect.left + rect.width / 2
    const clamped = Math.max(-dragMax, Math.min(dragMax, e.clientX - cx))
    animate(dragX, clamped, reduced ? { duration: 0 } : { type: 'spring', ...SPR })
    setScore(scoreFromValue((clamped + dragMax) / (2 * dragMax)))
  }

  function handleConfirm() {
    if (phase !== 'pick') return
    setAck(pick(copy.mood.acks[MOOD.ackBucket(score)]))
    setPhase('ack')
    ackTimer.current = setTimeout(() => onSelectRef.current(score), M.ackHoldMs)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: MG.space.mobilePad,
      gap: MG.space.mobileGap,
      userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      {/* The orb answers the drag — dimmer toward static, brighter toward clear */}
      <DaemonOrb state={MOOD.orbStates[score - M.scoreMin]} size={M.orbSize} />

      {phase === 'pick' ? (
        <>
          <p style={{ fontFamily: TY.label.family, fontSize: 'var(--text-xl)', color: 'var(--text-primary)', textAlign: 'center' }}>
            {prompt}
          </p>

          <div style={{ width: '100%', maxWidth: M.trackMaxW, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div
              ref={trackRef}
              onClick={handleTrackClick}
              style={{ position: 'relative', width: '100%', height: T.height, cursor: 'ew-resize' }}
            >
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--border)', transform: 'translateY(-50%)' }} />
              <motion.div
                drag="x"
                dragConstraints={{ left: -dragMax, right: dragMax }}
                dragElastic={T.dragElastic}
                onDrag={syncScore}
                onDragEnd={syncScore}
                whileDrag={{ scale: T.handleScale }}
                style={{
                  x: dragX,
                  position: 'absolute', top: '50%', left: `calc(50% - ${T.handleSize / 2}px)`, marginTop: -(T.handleSize / 2),
                  width: T.handleSize, height: T.handleSize,
                  borderRadius: '50%', border: `${T.handleBorderW}px solid var(--text-primary)`,
                  background: 'var(--surface-elevated)', cursor: 'ew-resize', touchAction: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: TY.hint.family, fontSize: TY.hint.size, color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE }}>
                {copy.mood.lowLabel}
              </span>
              <span style={{ fontFamily: TY.hint.family, fontSize: TY.hint.size, color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE }}>
                {copy.mood.highLabel}
              </span>
            </div>
          </div>

          <button
            onClick={handleConfirm}
            className="daemon-btn daemon-btn-primary"
            style={{ width: '100%', maxWidth: T.confirmMaxW }}
          >
            {copy.mood.confirm}
          </button>

          <p style={{ fontFamily: TY.hint.family, fontSize: TY.hint.size, color: 'var(--text-muted)', opacity: MG.scale.hintOpacity, pointerEvents: 'none' }}>
            {copy.mood.hint}
          </p>
        </>
      ) : (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0 : MG.transition.revealS }}
          style={{
            fontFamily:    'var(--font-mono)',
            fontSize:      'var(--text-mono)',
            color:         'var(--compile-green)',
            letterSpacing: LETTER_SPACING_WIDE,
            textAlign:     'center',
            maxWidth:      M.ackMaxW,
          }}
        >
          {ack}
        </motion.p>
      )}
    </div>
  )
}
