import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { MG } from '../../lib/minigame'
import { copy } from '../../lib/copy'
import { seededRandom } from '../../lib/portrait'
import { playSound } from '../../lib/sound'
import { MIN_TOUCH_TARGET } from '../../lib/constants'

// The Split — a one-shot ultimatum (features-phase1.md §5). A single resource is
// on the table; the user divides it with one draggable divider and commits once,
// irreversibly. The other side can refuse — and then no one gets it. The offer
// itself, made under the shadow of that veto, is the signal: fairness disposition
// vs. strategic self-interest (agreeableness + locus_of_control), the game-theory
// dimension nothing else in the deck touches.
//
// MEDIUM-liberty design (§5d) — the negotiation table. Cold, transactional, mono;
// the resource is one horizontal bar and the divider is the only warm element. A
// faint watching counterpart sits on the far side. It is AMBIENT ONLY: it never
// reacts to the current split, because a reaction would leak a threshold and make
// the disposition gameable (the §5e "unsolvable game" principle). Deliberation
// (handle_moves, settle_ms) is captured now for a future computeSplitSignals
// (Phase 2).

const S = MG.split
const C = S.commit
const O = S.other

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def)

interface Props {
  onComplete: (responseData: unknown) => void
  /** Parsed fragment payload from buildSplit: { seed, framing }. Optional so the
   *  dev harness and any older/empty deck still render with the fallback framing. */
  params?: { seed?: unknown; framing?: unknown }
  /** Dev-only escape hatch: force motion on even when the OS requests reduced
   *  motion, so the full experience can be evaluated. Never set in production. */
  forceMotion?: boolean
}

export function Split({ params, onComplete, forceMotion }: Props) {
  const reduced = useReducedMotion() && !forceMotion

  const framing = typeof params?.framing === 'string' && params.framing
    ? params.framing
    : copy.split.framingFallback
  // Per-night jitter on the counterpart's breath, so the table is never identical.
  const breatheMs = useMemo(() => {
    const rng = seededRandom(num(params?.seed, 1) >>> 0)
    return O.breatheMs * (1 + (rng() * 2 - 1) * O.jitter)
  }, [params?.seed])

  const [committed, setCommitted] = useState(false)
  const [ariaPct,   setAriaPct]   = useState(Math.round(S.startKeep * 100))
  const [dragMax,   setDragMax]   = useState(S.barMaxW / 2)

  // The divider position is the source of truth for the visuals; keepMV maps it to
  // 0..1 (0 = give it all away, 1 = take it all). Semantic state (aria, moves) is
  // updated at settle points, not every frame.
  const dragX  = useMotionValue(0)
  const keepMV = useTransform(dragX, [-dragMax, dragMax], [S.keepMin, S.keepMax])
  const fillSX = useTransform(keepMV, (k) => clamp01(k)) // keep-side fill (scaleX from the left)

  const barRef        = useRef<HTMLDivElement>(null)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  // Timing/deliberation. mount resets after paint so the route-transition fade
  // doesn't count against ms (mirrors WeightedScale/PredictionDuel).
  const mountRef    = useRef(0)
  const lastMoveRef = useRef(0)
  const movesRef    = useRef(0)
  useEffect(() => { mountRef.current = Date.now() }, [])

  // Measure the rendered bar (before paint) so the divider can reach both ends
  // (keep 0 and 1) and the keyboard mapping uses the real half-width from frame 1.
  useLayoutEffect(() => {
    if (!barRef.current) return
    setDragMax(Math.floor(barRef.current.getBoundingClientRect().width / 2))
  }, [])

  // Commit → compute the offer and hand back after the silent 'offered.' beat. In
  // an effect so the timing read stays out of render (react-hooks/purity); the
  // clock is read one paint after the click, which is within a frame of it.
  useEffect(() => {
    if (!committed) return
    const now      = Date.now()
    const keep     = clamp01(keepMV.get())
    const lastMove = lastMoveRef.current || mountRef.current
    const data = {
      v: 1,
      ms: now - (mountRef.current || now),
      you_keep: Math.round(keep * 1000) / 1000,
      settle_ms: now - lastMove,
      handle_moves: movesRef.current,
    }
    const t = setTimeout(() => onCompleteRef.current(data), C.sentMs)
    return () => clearTimeout(t)
  }, [committed, keepMV])

  // Record one deliberate adjustment. keepForAria lets a caller pass the settled
  // target directly (a track-click animates the spring, so keepMV.get() would read
  // the pre-animation value); a live drag omits it and reads the current position.
  function registerMove(keepForAria?: number) {
    lastMoveRef.current = Date.now()
    movesRef.current += 1
    setAriaPct(Math.round(clamp01(keepForAria ?? keepMV.get()) * 100))
  }

  function keepToX(keep: number) {
    return (clamp01(keep) - 0.5) * 2 * dragMax
  }

  function handleBarClick(e: React.MouseEvent<HTMLDivElement>) {
    if (committed) return
    const rect    = e.currentTarget.getBoundingClientRect()
    const clamped = Math.max(-dragMax, Math.min(dragMax, e.clientX - (rect.left + rect.width / 2)))
    animate(dragX, clamped, reduced ? { duration: 0 } : { type: 'spring', ...MG.spring })
    registerMove(0.5 + clamped / (2 * dragMax))
  }

  function handleKey(e: React.KeyboardEvent) {
    if (committed) return
    let dir: number
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') dir = 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') dir = -1
    else return
    e.preventDefault()
    const next = clamp01(keepMV.get() + dir * S.keyStep)
    dragX.set(keepToX(next))
    registerMove(next)
  }

  function handleCommit() {
    if (committed) return
    playSound('click') // the hard click of the offer locking
    setCommitted(true) // the commit effect reads the offer + hands back
  }

  const warm = (a: number) => `rgba(${S.warm}, ${a})`
  const hitW = Math.max(S.handleHitW, MIN_TOUCH_TARGET)

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: MG.space.mobilePad, gap: MG.space.mobileGap,
      userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      {/* The resource on the table — oblique framing, the only warm-adjacent line */}
      <p style={{
        fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)',
        color: 'var(--text-primary)', textAlign: 'center', maxWidth: S.barMaxW, lineHeight: 1.2,
      }}>
        {framing}
      </p>

      <div style={{ width: '100%', maxWidth: S.barMaxW, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {/* The bar. Click to place the divider; drag or key it for precision. */}
        <div
          ref={barRef}
          onClick={handleBarClick}
          style={{
            position: 'relative', width: '100%', height: S.barHeight,
            border: '1px solid var(--border-active)', borderRadius: 'var(--radius-sm)',
            background: S.getFill, overflow: 'hidden',
            cursor: committed ? 'default' : 'ew-resize',
          }}
        >
          {/* your side — fills from the left as you keep more */}
          <motion.div style={{
            position: 'absolute', inset: 0, transformOrigin: '0% 50%',
            scaleX: fillSX, background: S.keepFill, pointerEvents: 'none',
          }} />

          {/* the watching other — ambient, on their side; never reacts to the offer */}
          <motion.div
            aria-hidden="true"
            animate={reduced ? {} : { opacity: [O.restAlpha, O.breathAlpha, O.restAlpha] }}
            transition={reduced ? undefined : { duration: breatheMs / 1000, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', top: '50%', right: O.insetPx, marginTop: -O.sizePx / 2,
              width: O.sizePx, height: O.sizePx, borderRadius: '50%',
              background: 'var(--text-secondary)', pointerEvents: 'none',
              opacity: reduced ? O.restAlpha : undefined,
            }}
          />

          {/* the divider — the single warm element, and the whole decision */}
          <motion.div
            drag={committed ? false : 'x'}
            dragConstraints={{ left: -dragMax, right: dragMax }}
            dragElastic={0}
            dragMomentum={false}
            onDrag={() => setAriaPct(Math.round(clamp01(keepMV.get()) * 100))}
            onDragEnd={() => registerMove()}
            onKeyDown={handleKey}
            role="slider"
            tabIndex={committed ? -1 : 0}
            aria-label={copy.split.aria}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ariaPct}
            aria-valuetext={`${ariaPct}% ${copy.split.youKeep}`}
            style={{
              x: dragX,
              position: 'absolute', top: 0, bottom: 0, left: `calc(50% - ${hitW / 2}px)`,
              width: hitW, display: 'flex', justifyContent: 'center', alignItems: 'stretch',
              cursor: committed ? 'default' : 'ew-resize', touchAction: 'none',
              background: 'transparent',
            }}
          >
            {/* the divider line — settles into its locked state on commit (a hard
                click; the color/glow snap is instant under reduced motion) */}
            <div
              style={{
                width: S.handleW, height: '100%',
                background: warm(committed ? S.dividerLockAlpha : S.dividerAlpha),
                boxShadow: committed ? `0 0 ${C.glowPx}px ${warm(C.glowAlpha)}` : 'none',
                transition: reduced ? undefined : `background ${C.lockMs}ms ease-out, box-shadow ${C.lockMs}ms ease-out`,
              }}
            />
          </motion.div>
        </div>

        {/* the two shares */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            {copy.split.youKeep}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            {copy.split.theyGet}
          </span>
        </div>
      </div>

      {/* the veto (or, once locked, the silent 'offered.' beat — never a verdict) */}
      <div style={{ minHeight: 'var(--space-6)', display: 'flex', alignItems: 'center' }} aria-live="polite">
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
          color: committed ? 'var(--text-secondary)' : 'var(--text-muted)',
          letterSpacing: '0.06em', textAlign: 'center',
          transition: reduced ? undefined : 'color 0.3s',
        }}>
          {committed ? copy.split.sent : copy.split.veto}
        </p>
      </div>

      {!committed && (
        <button
          onClick={handleCommit}
          className="daemon-btn daemon-btn-primary"
          style={{ width: '100%', maxWidth: MG.track.confirmMaxW }}
        >
          {copy.split.commit}
        </button>
      )}
    </div>
  )
}
