import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { MG, isDesktop } from '../../lib/minigame'

export interface WeightedScaleResult {
  left: string
  right: string
  value: number            // -1.0 = full left, 0 = center, 1.0 = full right
  deliberationTimeMs: number
}

interface Props {
  pairs: { left: string; right: string }[]
  onComplete: (results: WeightedScaleResult[]) => void
  isEmbedded?: boolean  // when true: relative positioning + no progress indicator (for Pulse context)
}

const { track: T, scale: S, type: TY, spring: SPR } = MG

export function WeightedScale({ pairs, onComplete, isEmbedded = false }: Props) {
  const reduced = useReducedMotion()

  const [idx, setIdx]               = useState(0)
  const [showNext, setShowNext]     = useState(false)
  const [committed, setCommitted]   = useState(false)
  const [pairVisible, setPairVisible] = useState(true)
  const [dragMax, setDragMax]       = useState(120)
  const resultsRef                  = useRef<WeightedScaleResult[]>([])
  // Initialize to 0; useEffect resets after first paint so pair-0 deliberation time
  // measures from when the component is visible, not during the route-transition fade-in.
  // Mirrors PredictionDuel's mountTimeRef pattern.
  const pairStartTimeRef            = useRef(0)
  useEffect(() => { pairStartTimeRef.current = Date.now() }, [])
  const trackRef                    = useRef<HTMLDivElement>(null)
  const onCompleteRef               = useRef(onComplete)
  onCompleteRef.current             = onComplete

  // Measure actual rendered track width for accurate drag constraints
  useLayoutEffect(() => {
    if (!trackRef.current) return
    const w = trackRef.current.getBoundingClientRect().width
    setDragMax(Math.floor(w / 2) - T.edgeInset)
  }, [])

  const dragX      = useMotionValue(0)
  const value      = useTransform(dragX, [-dragMax, dragMax], [-1, 1])
  const armRotate  = useTransform(value, [-1, 1], [-S.armRotationDeg, S.armRotationDeg])
  const leftAlpha  = useTransform(value, [-1, -S.commitThreshold, S.commitThreshold, 1], [1, S.dimmedAlpha, S.dimmedAlpha, S.dimmedAlpha])
  const rightAlpha = useTransform(value, [-1, -S.commitThreshold, S.commitThreshold, 1], [S.dimmedAlpha, S.dimmedAlpha, S.dimmedAlpha, 1])

  const pair       = pairs[idx]
  const transMs    = MG.transition.pairMs

  function reveal() {
    if (Math.abs(value.get()) > S.commitThreshold) setShowNext(true)
  }

  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect    = e.currentTarget.getBoundingClientRect()
    const cx      = rect.left + rect.width / 2
    const clamped = Math.max(-dragMax, Math.min(dragMax, e.clientX - cx))
    animate(dragX, clamped, reduced ? { duration: 0 } : { type: 'spring', ...SPR })
    if (Math.abs(clamped / dragMax) > S.commitThreshold) setShowNext(true)
  }

  function handleNext() {
    if (committed) return
    setCommitted(true)
    const v                = Math.max(-1, Math.min(1, value.get()))
    const deliberationTimeMs = Date.now() - pairStartTimeRef.current
    const next = [...resultsRef.current, { left: pair.left, right: pair.right, value: v, deliberationTimeMs }]
    resultsRef.current = next

    if (idx + 1 >= pairs.length) {
      onCompleteRef.current(next)
      return
    }

    // Fade out → reset → advance → fade in → start timer
    // pairStartTimeRef resets after fade-in completes so deliberationTimeMs
    // measures time the user can actually see the pair, not the animation.
    setPairVisible(false)
    setTimeout(() => {
      dragX.set(0)
      setShowNext(false)
      setIdx(idx + 1)
      setCommitted(false)
      setPairVisible(true)
      setTimeout(() => {
        pairStartTimeRef.current = Date.now()
      }, reduced ? 0 : transMs)
    }, reduced ? 0 : transMs)
  }

  // ── Shared elements ────────────────────────────────────────────────────────

  const progressEl = isEmbedded ? null : (
    <p style={{ fontFamily: TY.mono.family, fontSize: TY.mono.size, color: 'var(--text-muted)', letterSpacing: '0.06em', flexShrink: 0 }}>
      {idx + 1} of {pairs.length}
    </p>
  )

  // Track fills 100% of its container — dragMax measured after mount
  const trackEl = (
    <div
      ref={trackRef}
      onClick={handleTrackClick}
      style={{ position: 'relative', width: '100%', height: T.height, cursor: 'ew-resize', flexShrink: 0 }}
    >
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--border)', transform: 'translateY(-50%)' }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 1, height: 12, background: 'var(--border-active)' }} />
      <span style={{ position: 'absolute', top: '50%', left: 4, transform: 'translateY(-50%)', fontFamily: TY.hint.family, fontSize: TY.hint.size, color: 'var(--text-muted)', lineHeight: 1 }}>←</span>
      <span style={{ position: 'absolute', top: '50%', right: 4, transform: 'translateY(-50%)', fontFamily: TY.hint.family, fontSize: TY.hint.size, color: 'var(--text-muted)', lineHeight: 1 }}>→</span>
      <motion.div
        drag="x"
        dragConstraints={{ left: -dragMax, right: dragMax }}
        dragElastic={T.dragElastic}
        onDragEnd={reveal}
        whileDrag={{ scale: T.handleScale }}
        style={{
          x: dragX,
          position: 'absolute', top: '50%', left: `calc(50% - ${T.handleSize / 2}px)`, marginTop: -(T.handleSize / 2),
          width: T.handleSize, height: T.handleSize,
          borderRadius: '50%', border: '1.5px solid var(--text-primary)',
          background: 'var(--surface-elevated)', cursor: 'ew-resize', touchAction: 'none',
        }}
      />
    </div>
  )

  const confirmBtn = (
    <motion.button
      onClick={handleNext}
      initial={false}
      animate={{ opacity: showNext ? 1 : 0, y: showNext ? 0 : 8 }}
      transition={{ duration: reduced ? 0 : MG.transition.revealS }}
      disabled={!showNext || committed}
      className="daemon-btn daemon-btn-primary"
      style={{ width: '100%', maxWidth: 200, pointerEvents: showNext ? 'auto' : 'none', flexShrink: 0 }}
    >
      {idx + 1 < pairs.length ? 'Next →' : 'Done →'}
    </motion.button>
  )

  // Pair content fades between each pair
  const pairFade = {
    animate: { opacity: pairVisible ? 1 : 0 },
    transition: { duration: reduced ? 0 : transMs / 1000, ease: 'easeInOut' as const },
  }

  // ── Mobile: left word above, right word below, full-width track ────────────
  if (!isDesktop) {
    return (
      <div style={{
        ...(isEmbedded ? { position: 'relative' } : { position: 'fixed', inset: 0 }),
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: MG.space.mobilePad,
        gap: MG.space.mobileGap,
        userSelect: 'none', WebkitUserSelect: 'none',
      }}>
        {progressEl}

        <motion.div {...pairFade} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: MG.space.mobileGap, width: '100%' }}>
          <motion.span style={{ opacity: leftAlpha, fontFamily: TY.label.family, fontSize: TY.label.size, color: 'var(--text-primary)', textAlign: 'center' }}>
            {pair.left}
          </motion.span>

          {trackEl}

          <motion.span style={{ opacity: rightAlpha, fontFamily: TY.label.family, fontSize: TY.label.size, color: 'var(--text-primary)', textAlign: 'center' }}>
            {pair.right}
          </motion.span>
        </motion.div>

        {confirmBtn}
      </div>
    )
  }

  // ── Desktop: side-by-side labels + decorative SVG arm ─────────────────────
  const svgW  = MG.scale.svgDesktopWidth ?? 480
  const svgCx = svgW / 2

  return (
    <div style={{
      ...(isEmbedded ? { position: 'relative' } : { position: 'fixed', inset: 0 }),
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: MG.space.desktopPad,
      gap: MG.space.desktopGap,
      userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      {progressEl}

      <motion.div {...pairFade} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: MG.space.desktopGap, width: '100%', maxWidth: svgW }}>
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
          <motion.span style={{ opacity: leftAlpha, fontFamily: TY.label.family, fontSize: TY.label.size, color: 'var(--text-primary)' }}>
            {pair.left}
          </motion.span>
          <motion.span style={{ opacity: rightAlpha, fontFamily: TY.label.family, fontSize: TY.label.size, color: 'var(--text-primary)' }}>
            {pair.right}
          </motion.span>
        </div>

        <svg width={svgW} height={80} viewBox={`0 0 ${svgW} 80`} style={{ overflow: 'visible', pointerEvents: 'none' }}>
          <motion.line x1={16} y1={40} x2={svgW - 16} y2={40} stroke="var(--text-secondary)" strokeWidth={1.5} strokeLinecap="round"
            style={{ rotate: armRotate, originX: `${svgCx}px`, originY: '40px' }} />
          <motion.circle cx={16} cy={40} r={5} fill="none" stroke="var(--border-active)" strokeWidth={1}
            style={{ rotate: armRotate, originX: `${svgCx}px`, originY: '40px' }} />
          <motion.circle cx={svgW - 16} cy={40} r={5} fill="none" stroke="var(--border-active)" strokeWidth={1}
            style={{ rotate: armRotate, originX: `${svgCx}px`, originY: '40px' }} />
          <line x1={svgCx} y1={40} x2={svgCx} y2={72} stroke="var(--border-active)" strokeWidth={1} />
          <line x1={svgCx - 28} y1={72} x2={svgCx + 28} y2={72} stroke="var(--border-active)" strokeWidth={1} />
          <circle cx={svgCx} cy={40} r={3} fill="var(--text-muted)" />
        </svg>

        {trackEl}

        <p style={{ fontFamily: TY.hint.family, fontSize: TY.hint.size, color: 'var(--text-muted)', letterSpacing: '0.04em', opacity: showNext ? 0 : S.hintOpacity, transition: 'opacity 0.3s', pointerEvents: 'none' }}>
          drag or tap to set your balance
        </p>
      </motion.div>

      {confirmBtn}
    </div>
  )
}
