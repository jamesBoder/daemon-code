import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { MG } from '../../lib/minigame'
import { copy } from '../../lib/copy'
import { seededRandom } from '../../lib/portrait'
import { playSound } from '../../lib/sound'
import { MIN_TOUCH_TARGET } from '../../lib/constants'

// The Split — a one-shot ultimatum (features-phase1.md §5). A single resource is
// on the table; the user divides it with one draggable divider and commits once.
// The other side can refuse — and then no one gets it. The offer, made under that
// REAL veto, is the signal: fairness disposition vs. strategic self-interest
// (agreeableness + locus_of_control), the game-theory dimension nothing else in
// the deck touches.
//
// The veto is not decorative: on commit the counterpart accepts iff their share
// (1 - you_keep) meets a hidden RESERVATION drawn per night from the payload seed.
// Reach too far and the offer is refused — the resource drains and is gone. The
// threshold is never shown and varies nightly, and the counterpart is inert while
// you set the offer (a live meter would leak the line), so the disposition stays
// unsolvable (§5e). This — a real gamble against a person with a dramatic verdict —
// is what separates it from WeightedScale's weightless self-positioning.
//
// MEDIUM-liberty design (§5d) — the negotiation table. Cold, transactional, mono;
// the divider is the only warm element until acceptance seeps the daemon's indigo
// presence in as the reward. Deliberation (handle_moves, settle_ms) and the
// outcome are captured for a future computeSplitSignals (Phase 2).

const S = MG.split
const C = S.commit
const O = S.other
const V = S.veto

type Verdict = 'accepted' | 'refused' | null

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const round3 = (v: number) => Math.round(v * 1000) / 1000
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
  // Everything the seed decides, drawn once: the counterpart's breath jitter and
  // its hidden reservation (the minimum share it will accept tonight). Same seed →
  // same "person," so a night is a fixed table; the seed varies nightly so the
  // line can't be learned (§5e). Never surfaced to the player.
  const { breatheMs, reservation } = useMemo(() => {
    const rng = seededRandom(num(params?.seed, 1) >>> 0)
    const breath = O.breatheMs * (1 + (rng() * 2 - 1) * O.jitter)
    const r = V.rMin + rng() * (V.rMax - V.rMin)
    return { breatheMs: breath, reservation: r }
  }, [params?.seed])

  const [committed, setCommitted] = useState(false)
  const [verdict,   setVerdict]   = useState<Verdict>(null)
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

  // Commit → the other decides against its hidden reservation → reveal → hand back.
  // In an effect so the timing read stays out of render (react-hooks/purity); the
  // clock is read one paint after the click, which is within a frame of it.
  useEffect(() => {
    if (!committed) return
    const now      = Date.now()
    const keep     = clamp01(keepMV.get())
    const theyGet  = 1 - keep
    const accepted = theyGet >= reservation // reach too far and it's refused
    const lastMove = lastMoveRef.current || mountRef.current
    const data = {
      v: 2,
      ms: now - (mountRef.current || now),
      you_keep: round3(keep),
      they_get: round3(theyGet),
      accepted,
      settle_ms: now - lastMove,
      handle_moves: movesRef.current,
    }
    const tReveal = setTimeout(() => setVerdict(accepted ? 'accepted' : 'refused'), C.considerMs)
    const tDone   = setTimeout(() => onCompleteRef.current(data), C.considerMs + C.revealMs)
    return () => { clearTimeout(tReveal); clearTimeout(tDone) }
  }, [committed, keepMV, reservation])

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

  const warm     = (a: number) => `rgba(${S.warm}, ${a})`
  const presence = (a: number) => `rgba(${S.presence}, ${a})`
  const hitW     = Math.max(S.handleHitW, MIN_TOUCH_TARGET)
  const deciding = committed && verdict === null
  // The divider goes warm-lock on commit, indigo on acceptance, cold on refusal.
  const dividerBg = verdict === 'refused' ? 'rgba(255, 255, 255, 0.22)'
    : verdict === 'accepted' ? presence(0.95)
    : warm(committed ? S.dividerLockAlpha : S.dividerAlpha)

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
            border: `1px solid ${verdict === 'accepted' ? presence(0.5) : 'var(--border-active)'}`,
            borderRadius: 'var(--radius-sm)',
            background: S.getFill, overflow: 'hidden',
            cursor: committed ? 'default' : 'ew-resize',
            // Acceptance seeps the daemon's presence into the resource (the reward);
            // refusal leaves it cold as it drains.
            boxShadow: verdict === 'accepted' ? `inset 0 0 ${C.acceptGlowPx}px ${presence(0.35)}` : 'none',
            transition: reduced ? undefined : `box-shadow ${C.revealMs / 2}ms ease-out, border-color ${C.revealMs / 2}ms ease-out`,
          }}
        >
          {/* your side — fills from the left as you keep more; warms on acceptance,
              drains to nothing on refusal (the resource is gone) */}
          <motion.div style={{
            position: 'absolute', inset: 0, transformOrigin: '0% 50%',
            scaleX: fillSX, background: verdict === 'accepted' ? presence(0.16) : S.keepFill,
            opacity: verdict === 'refused' ? 0 : 1, pointerEvents: 'none',
            transition: reduced ? undefined : `background ${C.revealMs / 2}ms ease-out, opacity ${C.drainMs}ms ease-in`,
          }} />

          {/* the watching other — ambient breath while you decide; it leans in to
              judge on commit (indigo if it accepts, fading out if it refuses) */}
          <motion.div
            aria-hidden="true"
            animate={reduced ? {} : deciding ? { opacity: O.decideAlpha } : committed ? {} : { opacity: [O.restAlpha, O.breathAlpha, O.restAlpha] }}
            transition={reduced ? undefined : deciding ? { duration: C.considerMs / 1000, ease: 'easeOut' } : { duration: breatheMs / 1000, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', top: '50%', right: O.insetPx, marginTop: -O.sizePx / 2,
              width: O.sizePx, height: O.sizePx, borderRadius: '50%',
              background: verdict === 'accepted' ? presence(1) : 'var(--text-secondary)',
              boxShadow: !reduced && (deciding || verdict === 'accepted')
                ? `0 0 ${O.decidePx}px ${verdict === 'accepted' ? presence(0.7) : 'var(--text-secondary)'}` : 'none',
              opacity: verdict === 'refused' ? 0 : reduced ? (committed ? O.decideAlpha : O.restAlpha) : undefined,
              pointerEvents: 'none',
              transition: reduced ? undefined : `opacity ${C.considerMs}ms ease-out, background ${C.considerMs}ms ease-out`,
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
            {/* the divider line — locks warm on commit (a hard click), then takes
                the verdict's colour: indigo on accept, cold on refuse */}
            <div
              style={{
                width: S.handleW, height: '100%',
                background: dividerBg,
                boxShadow: verdict === 'accepted' ? `0 0 ${C.glowPx}px ${presence(C.glowAlpha)}`
                  : committed && verdict === null ? `0 0 ${C.glowPx}px ${warm(C.glowAlpha)}` : 'none',
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

      {/* the veto → the suspense beat → the verdict (the threshold is never shown) */}
      <div style={{ minHeight: 'var(--space-6)', display: 'flex', alignItems: 'center' }} aria-live="polite">
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
          color: verdict === 'accepted' ? presence(0.95)
            : verdict === 'refused' ? 'var(--text-secondary)'
            : committed ? 'var(--text-secondary)' : 'var(--text-muted)',
          letterSpacing: '0.06em', textAlign: 'center',
          transition: reduced ? undefined : 'color 0.3s',
        }}>
          {verdict === 'accepted' ? copy.split.accepted
            : verdict === 'refused' ? copy.split.refused
            : committed ? copy.split.deciding : copy.split.veto}
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
