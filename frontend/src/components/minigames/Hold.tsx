import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { MG } from '../../lib/minigame'
import { seededRandom } from '../../lib/portrait'
import { startHoldTone, setHoldTone, stopHoldTone, playHoldRelease } from '../../lib/sound'
import { MIN_TOUCH_TARGET } from '../../lib/constants'

// The Hold — the one fragment with no task and no content. The daemon stops
// asking: a colourless void and a single breathing ring. There is no right
// answer; leaving early is signal, not failure.
//
// Full-liberty design (features-horizon §5d): the emptiness IS the design, and
// its identity is ACHROMATIC — the only screen in the app with no colour. Colour
// returns only as a reward: the daemon's indigo presence seeps in the longer you
// remain. The opposite pole from the Stroop Variant's typographic war.
//
// THE PROBING VOID (§5e — the unsolvable game). The void is not passive. It
// OFFERS the exit harder at intervals (temptation), TESTS your stillness with a
// faint drifting stimulus (reactivity probe), and ADAPTS — the more composed you
// read, the harder it tempts. Resisting an offered exit takes you deeper. The
// read is multi-dimensional: how settled you get (stillness), how deep you go
// (resisted temptations), whether you bolt when the way out is dangled
// (left_on_temptation), and how much faint movement pulls at you (reactive taps).
// Personalized + seeded so it's never the same room twice (see deriveSession).

const H = MG.hold
const P = H.probe

const ink = (alpha: number) => `rgba(${H.ink}, ${alpha})`
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def)

interface Props {
  onComplete: (responseData: unknown) => void
  /** Parsed fragment payload from buildHold: { seed, charge, intimacy }. Optional
   *  so the dev harness and any older/empty deck still render a (neutral) void. */
  params?: { seed?: unknown; charge?: unknown; intimacy?: unknown }
  /** Dev-only escape hatch: force motion on even when the OS requests reduced
   *  motion, so the full experience can be evaluated. Never set in production. */
  forceMotion?: boolean
}

type Ended = 'released' | 'timeout'
type EvType = 'tempt' | 'probe'
interface Ev { start: number; end: number; type: EvType }

// The resolved per-session void: config base ranges jittered by the seed and
// tuned by the daemon's read, plus the schedule of temptation / probe events.
// Computed once per mount from the payload.
interface Session {
  minDwellMs: number
  maxMs: number
  breatheMs: number
  breatheMsDeep: number
  emanationCount: number
  ringScale: number
  grainRest: number
  grainClear: number
  presenceMaxAlpha: number
  schedule: Ev[]
}

function deriveSession(seed: number, charge: number, intimacy: number): Session {
  const D = H.dyn
  const rng = seededRandom(seed >>> 0)
  const jit = (frac: number) => 1 + (rng() * 2 - 1) * frac // 1 ± frac
  const breathTune = 1 - charge * D.chargeBreathCut        // a more anxious model → a quicker void
  const maxMs = Math.round(H.maxMs * jit(D.maxJitter))

  // The void's events alternate temptation → probe, spaced by seed-jittered gaps,
  // from the first temptation to the cap. A more anxious model (charge) tempts a
  // touch sooner; the count falls out of the timeline.
  const schedule: Ev[] = []
  let t = P.temptFirstMs * (1 - charge * D.chargeBreathCut)
  let type: EvType = 'tempt'
  while (t + P.windowMs < maxMs) {
    schedule.push({ start: Math.round(t), end: Math.round(t + P.windowMs), type })
    t += P.windowMs + P.gapMs * jit(P.gapJitter)
    type = type === 'tempt' ? 'probe' : 'tempt'
  }

  return {
    minDwellMs: Math.round(H.minDwellMs * jit(D.minDwellJitter) * (1 - intimacy * D.intimacyDwellCut)),
    maxMs,
    breatheMs: H.breatheMs * jit(D.seedJitter) * breathTune,
    breatheMsDeep: H.breatheMsDeep * jit(D.seedJitter) * breathTune,
    emanationCount: D.emanationMin + Math.floor(rng() * (D.emanationMax - D.emanationMin + 1)),
    ringScale: jit(D.seedJitter),
    grainRest: H.grainRest + charge * D.chargeGrainAdd,
    grainClear: Math.max(0, H.grainClear - intimacy * D.intimacyClearAdd),
    presenceMaxAlpha: H.presenceMaxAlpha + intimacy * D.intimacyPresence,
    schedule,
  }
}

export function Hold({ onComplete, params, forceMotion = false }: Props) {
  const reduced = useReducedMotion() && !forceMotion

  // Resolve the void ONCE at mount from the stamped payload (neutral defaults when
  // absent — a Day-0 model or the dev harness). A lazy initializer, not useMemo:
  // the parent re-creates the raw payload object every render, so the void must be
  // frozen at mount rather than recomputed when that identity changes.
  const [V] = useState<Session>(() =>
    deriveSession(num(params?.seed, 0), clamp01(num(params?.charge, 0.5)), clamp01(num(params?.intimacy, 0))),
  )

  // What React needs to re-render: whether the exit is available, whether a probe
  // stimulus is on screen, and the closing exhale. Everything else is direct
  // style writes.
  const [releasable, setReleasable] = useState(false)
  const [probeOn, setProbeOn] = useState(false)
  const [closing, setClosing] = useState(false)

  const breathRef = useRef<HTMLDivElement>(null)    // transform target (breath + recoil + seed size + temptation pull)
  const ringRef = useRef<HTMLDivElement>(null)      // opacity → resolve
  const presenceRef = useRef<HTMLDivElement>(null)  // indigo core opacity → resolve
  const releaseRef = useRef<HTMLButtonElement>(null) // opacity → reveal + temptation swell (driven in raf)
  const releaseFillRef = useRef<HTMLSpanElement>(null) // the commit-fill bar under 'release' (scaleX → hold progress)

  const releaseHoldStart = useRef(0)                 // when the press-and-hold to leave began (0 = not holding)
  const releaseAttemptsRef = useRef(0)               // reaches for the exit that didn't commit — ambivalence
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const mountRef = useRef(0)                         // set on mount (impure Date.now stays out of render)
  const revealStart = useRef(0)                      // when the exit first became available (for its fade-in)
  const firstTouchRef = useRef<number | null>(null)  // ms to first contact (ttfa)
  const restlessRef = useRef(0)                      // taps with no probe up
  const reactiveRef = useRef(0)                      // taps while a probe stimulus shows
  const resistedRef = useRef(0)                      // temptations let pass (depth)
  const composureRef = useRef<number>(P.composureStart) // adaptive read, 0..1 — drives temptation escalation
  const recoilStart = useRef(0)                      // timestamp of the last tap (0 = none)
  const stillRef = useRef(0)                          // stillness-progress 0..1 — climbs while calm, regresses on a tap
  const phaseRef = useRef(0)                          // accumulated breath phase (period can lengthen smoothly)
  const lastFrameRef = useRef(0)                      // prev frame timestamp
  const lastGrainRef = useRef(-1)                     // last written grain (throttles global repaints)
  const lastToneRef = useRef(-1)                       // last stillness sent to the Hold tone (throttles audio ramps)
  const processedRef = useRef(-1)                     // last schedule event resolved as passed
  const probingRef = useRef(false)                    // current probe state (read by the tap handler)
  const done = useRef(false)

  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const rafRef = useRef<number | undefined>(undefined)

  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  // finish reached through a ref so the auto-complete timer (in a deps-tracked
  // effect) never has to list it — the onCompleteRef idiom, applied to finish.
  const finishRef = useRef<(ended: Ended) => void>(() => {})

  function finish(ended: Ended) {
    if (done.current) return
    done.current = true
    clearTimeout(releaseTimer.current)
    clearTimeout(autoTimer.current)
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    document.documentElement.style.removeProperty('--grain-opacity') // restore the resting grain
    if (ended === 'released') playHoldRelease() // a soft exhale on commit
    stopHoldTone()
    const e = Date.now() - mountRef.current
    // Did they bolt the moment the void dangled the exit?
    const onTempt = V.schedule.some(ev => ev.type === 'tempt' && e >= ev.start && e < ev.end)
    const data = {
      v: 2,
      dwell_ms: e,
      ended,
      stillness: Number(stillRef.current.toFixed(3)), // how settled they got (earned, not elapsed)
      deepest: resistedRef.current,                   // temptations resisted = how deep they went
      temptations_resisted: resistedRef.current,
      reactive_taps: reactiveRef.current,             // pulled by the faint stimulus
      restless_taps: restlessRef.current,             // agitation in the empty stretches
      release_attempts: releaseAttemptsRef.current,   // reached for the exit but didn't commit — ambivalence
      left_on_temptation: ended === 'released' && onTempt,
      ttfa_ms: firstTouchRef.current,                 // null if they never touched
    }
    // The void exhales the user out rather than cutting (a moment of closure).
    // Reduced motion skips straight through.
    if (reduced) {
      onCompleteRef.current(data)
      return
    }
    if (ringRef.current) ringRef.current.style.opacity = '1' // a final acknowledgement flare
    setClosing(true)
    closeTimer.current = setTimeout(() => onCompleteRef.current(data), H.exit.closeMs)
  }

  useEffect(() => { finishRef.current = finish })

  // Lifecycle timers: reveal the exit after the (personalized) opening, and let
  // the user go at the cap (never a softlock). Cleared on unmount.
  useEffect(() => {
    mountRef.current = Date.now()
    startHoldTone() // a low pad that brightens as you settle (no-op unless sound is on)
    releaseTimer.current = setTimeout(() => {
      revealStart.current = Date.now()
      setReleasable(true)
    }, V.minDwellMs)
    autoTimer.current = setTimeout(() => finishRef.current('timeout'), V.maxMs)
    return () => {
      clearTimeout(releaseTimer.current)
      clearTimeout(autoTimer.current)
      clearTimeout(closeTimer.current)
      stopHoldTone()
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
  }, [V.minDwellMs, V.maxMs])

  // The living, probing void — direct style writes (no per-frame re-render). The
  // reward state is `resolve` = earned stillness + how deep you've gone, not raw
  // time. The schedule drives temptation (the exit beckons + a soft pull) and
  // probe windows (a drifting stimulus); composure escalates the temptation.
  useEffect(() => {
    const loop = () => {
      const now = Date.now()
      const dt = lastFrameRef.current ? now - lastFrameRef.current : 0
      lastFrameRef.current = now
      const elapsed = now - mountRef.current

      // Press-and-hold to leave: fill from 0→1 over exit.holdMs; completing commits
      // the release. (Releasing the press early is handled by abortRelease.)
      if (releaseHoldStart.current) {
        const hp = (now - releaseHoldStart.current) / H.exit.holdMs
        if (hp >= 1) { finishRef.current('released'); return }
        if (releaseFillRef.current) releaseFillRef.current.style.transform = `scaleX(${hp})`
      }

      // Resolve any temptation windows that have fully passed → resisted (deeper +
      // more composed). If they'd taken one, finish() would have stopped the loop.
      for (let i = processedRef.current + 1; i < V.schedule.length; i++) {
        if (elapsed < V.schedule[i].end) break
        processedRef.current = i
        if (V.schedule[i].type === 'tempt') {
          resistedRef.current += 1
          composureRef.current = clamp01(composureRef.current + P.composureResist)
        }
      }

      // Current event → temptation intensity (a rise-and-fall bump, escalated by
      // composure) and probe visibility.
      let temptIntensity = 0
      let probing = false
      for (const ev of V.schedule) {
        if (elapsed >= ev.start && elapsed < ev.end) {
          const bump = Math.sin(((elapsed - ev.start) / (ev.end - ev.start)) * Math.PI)
          if (ev.type === 'tempt') temptIntensity = bump * (1 + composureRef.current * P.escalation)
          else if (!reduced) probing = true
          break
        }
      }
      if (probing !== probingRef.current) { probingRef.current = probing; setProbeOn(probing) }

      // Recoil (motion only): inward snap on the ring + grain surge; also holds
      // stillness-progress back while it settles.
      let recoilFactor = 1
      let grainSurge = 0
      let recoilActive = false
      if (!reduced && recoilStart.current) {
        const rp = (now - recoilStart.current) / H.recoilMs
        if (rp < 1) {
          recoilActive = true
          const eo = easeOutCubic(rp)
          recoilFactor = lerp(H.recoilScale, 1, eo)
          grainSurge = H.grainSurge * (1 - eo)
        } else {
          recoilStart.current = 0
        }
      }

      // Stillness-progress: earned by calm, lost to restlessness. Resolve folds in
      // the depth reached, so resisting temptations visibly deepens the void.
      const stepUnit = dt / V.maxMs
      stillRef.current = clamp01(stillRef.current + (recoilActive ? -stepUnit * H.dyn.restlessRegress : stepUnit))
      const resolve = clamp01(stillRef.current + resistedRef.current * P.depthBoost)

      // Breath: integrate phase so the period can lengthen toward breatheMsDeep as
      // you settle, without a jump. A temptation adds a soft pull toward the exit.
      let scale: number = H.breatheScaleMax * V.ringScale
      let pull = 0
      if (!reduced) {
        const period = lerp(V.breatheMs, V.breatheMsDeep, resolve)
        phaseRef.current += (dt / period) * Math.PI * 2
        const breath = (Math.sin(phaseRef.current) + 1) / 2
        scale = lerp(H.breatheScaleMin, H.breatheScaleMax, breath) * recoilFactor * V.ringScale
        pull = temptIntensity * P.temptPullPx
      }
      if (breathRef.current) breathRef.current.style.transform = `translateY(${pull}px) scale(${scale})`
      if (ringRef.current) {
        ringRef.current.style.opacity = String(lerp(H.ringRestAlpha, H.ringFullAlpha, resolve) / H.ringFullAlpha)
      }
      if (presenceRef.current) presenceRef.current.style.opacity = String(V.presenceMaxAlpha * resolve)

      // The exit: fades in once available, swells when the void tempts you, and
      // holds full while you press-and-hold to commit.
      if (releaseRef.current) {
        let rel = 0
        if (releaseHoldStart.current) {
          rel = 1
        } else if (revealStart.current) {
          const revealT = clamp01((now - revealStart.current) / (H.releaseFadeS * 1000))
          rel = Math.min(1, H.releaseAlpha * revealT + temptIntensity * P.temptReleaseGain)
        }
        releaseRef.current.style.opacity = String(rel)
      }

      // Grain clears with the reward, surges on a restless tap.
      const grain = lerp(V.grainRest, V.grainClear, resolve) + grainSurge
      if (Math.abs(grain - lastGrainRef.current) > H.grainEpsilon) {
        document.documentElement.style.setProperty('--grain-opacity', grain.toFixed(3))
        lastGrainRef.current = grain
      }

      // The Hold tone tracks stillness (louder + brighter as you settle). Throttled
      // so audio params only re-ramp on a meaningful change; no-op unless sound is on.
      if (Math.abs(resolve - lastToneRef.current) > 0.02) {
        setHoldTone(resolve)
        lastToneRef.current = resolve
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
      document.documentElement.style.removeProperty('--grain-opacity') // restore the resting grain
    }
  }, [reduced, V])

  function handleVoidPointerDown() {
    if (done.current) return
    if (firstTouchRef.current === null) firstTouchRef.current = Date.now() - mountRef.current
    // A tap while a probe shows reads as reactivity (pulled by the stimulus);
    // otherwise it's plain restlessness in the empty stretch. Both lower composure
    // and recoil the void (motion only).
    if (probingRef.current) {
      reactiveRef.current += 1
      composureRef.current = clamp01(composureRef.current - P.composureReact)
    } else {
      restlessRef.current += 1
      composureRef.current = clamp01(composureRef.current - P.composureRestless)
    }
    if (!reduced) recoilStart.current = Date.now()
  }

  // Press-and-hold to leave. Starting the press arms the fill (driven in raf);
  // releasing before it completes is a reach that didn't commit — ambivalence.
  function startRelease(e: React.PointerEvent) {
    e.stopPropagation() // never counts as a restless void tap
    if (releasable && !done.current) releaseHoldStart.current = Date.now()
  }
  function abortRelease() {
    if (!releaseHoldStart.current || done.current) return
    releaseHoldStart.current = 0
    releaseAttemptsRef.current += 1
    if (releaseFillRef.current) releaseFillRef.current.style.transform = 'scaleX(0)'
  }
  // a11y: a keyboard / assistive-tech activation fires a click with detail 0 (no
  // pointer). Holding isn't possible there, so that path commits the release
  // instantly; real pointer clicks (detail > 0) are handled by the hold above.
  function clickRelease(e: React.MouseEvent) {
    if (e.detail === 0) finish('released')
  }

  // Emanation rings — config-driven scale/alpha via CSS custom props; count +
  // offsets from the seed.
  const emanationStyle = (i: number): CSSProperties => ({
    position: 'absolute', top: '50%', left: '50%',
    width: H.emanateSize, height: H.emanateSize, borderRadius: '50%',
    border: `1px solid ${ink(1)}`, pointerEvents: 'none',
    transform: 'translate(-50%, -50%)',
    ['--he-alpha' as string]: H.emanateAlpha,
    ['--he-scale' as string]: H.emanateMaxScale,
    animation: `holdEmanate ${H.emanateDurMs}ms ease-out ${(i * H.emanateDurMs) / V.emanationCount}ms infinite`,
  })

  return (
    <div
      onPointerDown={handleVoidPointerDown}
      aria-label="A still space. Remain as long as you like, or release."
      style={{
        position: 'fixed', inset: 0, background: H.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', touchAction: 'manipulation',
        animation: closing
          ? `holdFadeOut ${H.exit.closeMs}ms ease-out forwards`
          : reduced ? undefined : `holdReveal ${H.fadeS}s ease-out`,
      }}
    >
      {/* The void's slow heartbeat — faint rings emanating outward (motion only). */}
      {!reduced && Array.from({ length: V.emanationCount }, (_, i) => (
        <div key={i} style={emanationStyle(i)} />
      ))}

      {/* The reactivity probe — a faint mote drifts across while a probe window is
          open. Tapping while it shows reads as reactivity. */}
      {probeOn && (
        <span
          style={{
            position: 'absolute', top: '50%', left: '50%',
            width: P.moteSizePx, height: P.moteSizePx, borderRadius: '50%',
            background: ink(1), pointerEvents: 'none',
            ['--mote-travel' as string]: `${P.moteTravelVmin}vmin`,
            ['--mote-alpha' as string]: P.moteAlpha,
            animation: `holdMote ${P.windowMs}ms linear`,
          }}
        />
      )}

      {/* The breath — a colourless ring with an indigo presence behind it that
          only arrives as the user remains. Breath + recoil + pull ride the wrapper. */}
      <div ref={breathRef} style={{ display: 'grid', placeItems: 'center', willChange: 'transform' }}>
        <div
          ref={presenceRef}
          style={{
            gridArea: '1 / 1', width: H.presenceSize, height: H.presenceSize, borderRadius: '50%',
            background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
            opacity: 0, pointerEvents: 'none',
          }}
        />
        <div
          ref={ringRef}
          style={{
            gridArea: '1 / 1', width: H.ringSize, height: H.ringSize, borderRadius: '50%',
            border: `${H.ringBorderPx}px solid ${ink(H.ringFullAlpha)}`,
            background: `radial-gradient(circle, ${ink(H.innerFillAlpha)} 0%, transparent 70%)`,
            opacity: H.ringRestAlpha / H.ringFullAlpha, pointerEvents: 'none',
          }}
        />
      </div>

      {/* The exit — hidden until the opening passes, then a wide, light exhale in
          the display serif. Leaving is a deliberate act: press and HOLD to commit
          (a fill grows beneath the word); a reach that lets go early just stays.
          Its opacity is driven in raf (reveal + temptation swell + hold). */}
      <button
        ref={releaseRef}
        onPointerDown={startRelease}
        onPointerUp={abortRelease}
        onPointerLeave={abortRelease}
        onPointerCancel={abortRelease}
        onClick={clickRelease}
        aria-label="Hold to release"
        aria-hidden={!releasable}
        tabIndex={releasable ? 0 : -1}
        style={{
          position: 'absolute',
          bottom: `calc(var(--space-8) + env(safe-area-inset-bottom))`,
          left: '50%', transform: 'translateX(-50%)',
          minHeight: MIN_TOUCH_TARGET, padding: 'var(--space-3) var(--space-6)',
          background: 'none', border: 'none',
          cursor: releasable ? 'pointer' : 'default',
          color: ink(0.9), fontFamily: 'var(--font-display)', fontWeight: 300,
          fontSize: 'var(--text-lg)', letterSpacing: H.releaseTracking, textTransform: 'lowercase',
          opacity: 0, // driven in raf
          pointerEvents: releasable ? 'auto' : 'none',
          touchAction: 'none', // a hold shouldn't scroll or be interrupted
        }}
      >
        release
        {/* Commit-fill — grows from the centre as you hold (scaleX driven in raf). */}
        <span
          ref={releaseFillRef}
          aria-hidden
          style={{
            position: 'absolute', left: 'var(--space-6)', right: 'var(--space-6)',
            bottom: 'var(--space-2)', height: 1, background: ink(H.exit.fillAlpha),
            transformOrigin: 'center', transform: 'scaleX(0)', pointerEvents: 'none',
          }}
        />
      </button>
    </div>
  )
}
