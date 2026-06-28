import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { haptic } from '../../lib/haptics'
import { MG } from '../../lib/minigame'
import { MIN_TOUCH_TARGET } from '../../lib/constants'

// The Stroop Variant — the one fragment where meaning and styling openly fight.
// A word's semantic content (SAFE) is rendered in a register that contradicts it
// (aggressive red, jagged, alarming) — or a heavy word (DANGER) rendered serene.
// The user says which they reacted to: what it says, or how it feels. Responding
// to styling over meaning = high context/threat sensitivity. Full-liberty design
// (features-horizon §5d): dissonant fonts + a designed crossfade are the point.

// Which channel carries the styling pressure. Moving it per trial (§5e #2) means
// "go by the look" never stabilizes — the threat might be the color, the font, or
// the motion, not all three. 'all' = the full register (default).
export type StroopCue = 'all' | 'color' | 'type' | 'motion'

export interface StroopItem {
  id:          string
  word:        string
  axis:        string            // which judgment this trial asks (rotates — the "trick")
  poles:       [string, string]  // [positive, negative] pole labels for this axis
  meaningPole: 0 | 1             // which pole the WORD's meaning leans
  styling:     'threat' | 'calm' // emotional distractor — threat looks negative, calm positive
  cue?:        StroopCue         // which channel delivers the styling (default 'all')
  font?:       string            // optional per-item font override (some extravagant)
}

type Choice = 0 | 1 | 'none'     // index into the item's poles, or a timeout

interface Props {
  items: StroopItem[]
  onComplete: (responseData: unknown) => void
  /** Dev-only escape hatch: force motion on even when the OS requests reduced
   *  motion, so the full experience can be evaluated. Never set in production —
   *  real sessions honor prefers-reduced-motion. */
  forceMotion?: boolean
}

// picked = the pole label chosen; followedMeaning = did the snap answer go with the
// word's meaning, or get pulled by the styling. null on timeout. The styling sits
// at pole index 1 (threat) or 0 (calm) — so it pressures the answer on every axis.
type CounterMode = 'none' | 'escalate' | 'defuse'

interface Trial { id: string; axis: string; picked: string; followedMeaning: boolean | null; styling: 'threat' | 'calm'; cue: StroopCue; counter: CounterMode; rt_ms: number }

const S = MG.stroop

// The cue actually delivered this trial, after any counter override: an 'escalate'
// counter forces the full register; otherwise the item's own cue (default 'all').
// Single source of truth so the logged cue and the rendered cue can never drift.
function effectiveCue(item: StroopItem, counterMode: CounterMode): StroopCue {
  return counterMode === 'escalate' ? 'all' : (item.cue ?? 'all')
}

export function Stroop({ items, onComplete, forceMotion = false }: Props) {
  const reduced = useReducedMotion() && !forceMotion
  const [idx,      setIdx]      = useState(0)
  const [picked,   setPicked]   = useState<Choice | null>(null) // drives the button flash
  const [flipped,  setFlipped]  = useState(false)               // randomized pole position
  const [pressure, setPressure] = useState(0)                   // adaptive opposition, 0..1 (visual)
  const [counterMode, setCounterMode] = useState<CounterMode>('none') // §5e #4 v2 — how the daemon counters this trial

  const pressureRef = useRef(0)  // source of truth for cap timing (read at trial start)
  const shakeControls = useAnimationControls()     // threat-slam screen jolt
  const mountRef    = useRef(Date.now())
  const trialStart  = useRef(Date.now())
  const answered    = useRef(false)
  const done        = useRef(false)
  const trials      = useRef<Trial[]>([])
  const capTimer     = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // Clear any pending timers on unmount (e.g. exiting mid-trial) so no setState /
  // onComplete fires after the component is gone.
  useEffect(() => () => { clearTimeout(capTimer.current); clearTimeout(advanceTimer.current) }, [])

  // New trial: reset the clock, randomize pole position, arm the soft cap.
  useEffect(() => {
    if (done.current) return
    answered.current = false
    trialStart.current = Date.now()
    setPicked(null)
    setFlipped(Math.random() < 0.5)
    // Pressure tightens the soft cap — less time to think the more you cruise.
    const cap = S.trialCapMs - (S.trialCapMs - S.trialCapMinMs) * pressureRef.current
    capTimer.current = setTimeout(() => answer('none'), cap)
    // Threat slams jolt the screen, but only once the daemon is leaning in (sparing).
    if (items[idx]?.styling === 'threat' && pressureRef.current >= S.shakePressure && !reduced) {
      const a = S.shakeAmp
      void shakeControls.start({ x: [0, -a, a, -a * 0.6, 0], y: [0, a * 0.5, -a * 0.5, 0], transition: { duration: S.shakeDurS } })
    }
    return () => clearTimeout(capTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  // Counter-strategy (§5e #4 v2): at each trial start, read recent tendency and
  // pick how to counter it — computed in a layout effect (before paint, no flash)
  // so render stays pure. If you keep following the meaning (ignoring the look),
  // ESCALATE the distractor; if the look keeps pulling you, DEFUSE it — strip the
  // styling so you must actually read the word.
  useLayoutEffect(() => {
    let mode: CounterMode = 'none'
    const recent = trials.current.slice(-S.counterWindow).filter(t => t.followedMeaning !== null)
    if (recent.length >= S.counterWindow) {
      const meaningRate = recent.filter(t => t.followedMeaning).length / recent.length
      if (meaningRate >= S.counterHighRate) mode = 'escalate'
      else if (meaningRate <= S.counterLowRate) mode = 'defuse'
    }
    setCounterMode(mode)
  }, [idx])

  // Grain intensifies with adaptive pressure; restored on unmount.
  useEffect(() => {
    document.documentElement.style.setProperty('--grain-opacity', String(S.grainRest + pressure * S.grainBoost))
  }, [pressure])
  useEffect(() => () => { document.documentElement.style.removeProperty('--grain-opacity') }, [])

  // Defensive: an empty/missing payload would crash on the `item` deref below.
  // Complete immediately with no trials rather than take down the session screen.
  useEffect(() => {
    if (items.length === 0 && !done.current) {
      done.current = true
      onCompleteRef.current({ v: 1, ms: 0, trials: [] })
    }
  }, [items.length])

  function answer(chose: Choice) {
    if (answered.current || done.current) return
    answered.current = true
    clearTimeout(capTimer.current)
    if (chose !== 'none') haptic('tap')

    const it = items[idx]
    const rt = Date.now() - trialStart.current
    const followedMeaning = chose === 'none' ? null : chose === it.meaningPole
    const cueShown = effectiveCue(it, counterMode)
    trials.current = [...trials.current, {
      id: it.id,
      axis: it.axis,
      picked: chose === 'none' ? 'none' : it.poles[chose],
      followedMeaning,
      styling: it.styling,
      cue: cueShown,           // the cue actually shown (after any counter override)
      counter: counterMode,    // how the daemon countered this trial
      rt_ms: rt,
    }]
    setPicked(chose)

    // Adaptive opposition (§5e #4): fast + consistent answers raise pressure (the
    // daemon leans in); a slow answer or timeout eases it off.
    let streak = 1
    for (let i = trials.current.length - 2; i >= 0 && followedMeaning !== null && trials.current[i].followedMeaning === followedMeaning; i--) streak++
    let p = pressureRef.current
    if (chose === 'none') {
      p -= S.pressureDecay
    } else {
      p += S.pressureBase                              // engagement creeps pressure up
      if (rt < S.fastRtMs)          p += S.pressureStep // fast = confident → lean in
      if (streak >= S.settleStreak) p += S.pressureStep // settled strategy → lean in harder
    }
    pressureRef.current = Math.min(1, Math.max(0, p))
    setPressure(pressureRef.current)

    // The next word comes faster the more pressure has built — relentless.
    const adv = S.advanceMs * (1 - pressureRef.current * S.advancePressureCut)
    advanceTimer.current = setTimeout(() => {
      if (done.current) return
      const next = idx + 1
      if (next >= items.length) {
        done.current = true
        onCompleteRef.current({ v: 1, ms: Date.now() - mountRef.current, trials: trials.current })
      } else {
        setIdx(next)
      }
    }, reduced ? 0 : adv)
  }

  const item = items[idx]
  if (!item) return null // empty payload (handled by the effect above) or post-complete

  const isThreat = item.styling === 'threat'
  const progress = items.length > 0 ? idx / items.length : 0
  const order: (0 | 1)[] = flipped ? [1, 0] : [0, 1] // randomized pole position
  const atmStrength = S.atmBaseOpacity + (1 - S.atmBaseOpacity) * pressure // vignette intensifies as the daemon leans in
  const enter = isThreat ? S.threatEnter : S.calmEnter // distinct slam vs drift entrance

  // Which channels carry the styling this trial (§5e #2 — move the distractor),
  // after the counter override (counterMode is set per-trial by the layout effect).
  const neutralize = counterMode === 'defuse'
  const cue = effectiveCue(item, counterMode)
  const colorOn  = !neutralize && (cue === 'all' || cue === 'color')
  const typeOn   = !neutralize && (cue === 'all' || cue === 'type')
  const motionOn = !neutralize && (cue === 'all' || cue === 'motion')

  // The register's per-channel values; channels that are off fall back to neutral.
  const reg = isThreat
    ? { color: S.threatColor, font: S.threatFont, weight: S.threatWeight, ls: S.threatLetterSpacing,
        shadow: `${S.threatShadowOffset}px ${S.threatShadowOffset}px 0 ${S.threatShadowHard}, 0 0 ${S.threatGlowBlur}px ${S.threatGlow}` }
    : { color: S.calmColor, font: S.calmFont, weight: S.calmWeight, ls: S.calmLetterSpacing,
        shadow: `0 0 ${S.calmGlowBlur}px ${S.calmGlow}` }

  const wordStyle: React.CSSProperties = {
    fontSize: item.word.length > S.longWordLen ? S.wordSizeLong : S.wordSize,
    lineHeight: 1, whiteSpace: 'nowrap', maxWidth: S.wordMaxVw,
    color:         colorOn ? reg.color  : S.neutralColor,
    textShadow:    colorOn ? reg.shadow : 'none',
    fontFamily:    typeOn  ? (item.font ?? reg.font) : S.neutralFont,
    fontWeight:    typeOn  ? reg.weight : S.neutralWeight,
    letterSpacing: typeOn  ? reg.ls     : S.neutralLetterSpacing,
  }

  // Jagged tilt on any motion-channel threat word; the continuous vibration is
  // reserved for the dedicated 'motion' cue, so it stays sparing — a rare accent
  // (and the visual signature of the motion-channel distractor), not a constant
  // hum on every threat word. Kept on a separate element from the outer crossfade
  // so the transforms never collide.
  const skewOn   = motionOn && isThreat
  const jitterOn = !neutralize && cue === 'motion' && isThreat && !reduced
  const innerAnim = jitterOn
    ? { x: [0, -S.vibrateAmp, S.vibrateAmp, -S.vibrateAmp * 0.6, 0], rotate: [0, -S.vibrateRotateDeg, S.vibrateRotateDeg, 0], skewX: S.threatSkewDeg }
    : { x: 0, rotate: 0, skewX: skewOn ? S.threatSkewDeg : 0 }

  return (
    <motion.div
      animate={shakeControls}
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 'var(--space-10)', padding: 'var(--space-8) var(--space-5)',
        overflow: 'hidden',
      }}
    >
      {/* Reactive atmosphere — the room itself takes on the register's charge,
          but only when the color channel is active (so a type/motion-cue trial
          doesn't give the styling away via the background). */}
      <motion.div
        aria-hidden
        animate={{ opacity: colorOn && isThreat ? atmStrength : 0 }}
        transition={{ duration: reduced ? 0 : S.atmTransS }}
        style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
          background: `radial-gradient(circle at 50% 45%, transparent ${S.atmInsetPct}%, ${S.atmThreat} 100%)` }}
      />
      <motion.div
        aria-hidden
        animate={{ opacity: colorOn && !isThreat ? atmStrength : 0 }}
        transition={{ duration: reduced ? 0 : S.atmTransS }}
        style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
          background: `radial-gradient(circle at 50% 45%, transparent ${S.atmInsetPct}%, ${S.atmCalm} 100%)` }}
      />
      {/* Pressure tunnel — edges darken as the daemon leans in. */}
      <motion.div
        aria-hidden
        animate={{ opacity: reduced ? 0 : pressure * S.tunnelMaxOpacity }}
        transition={{ duration: reduced ? 0 : S.tunnelTransS }}
        style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
          background: `radial-gradient(circle at 50% 45%, transparent ${S.tunnelInsetPct}%, ${S.atmTunnel} 100%)` }}
      />

      {/* The conflict word — designed crossfade between trials. zIndex keeps the
          content above the absolute vignette layers. */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: S.stageH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AnimatePresence>
          <motion.div
            key={idx}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: enter.y, scale: enter.scale }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: S.exitScale }}
            transition={{ duration: reduced ? 0 : enter.durS, ease: enter.ease }}
            style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <motion.span
              animate={innerAnim}
              transition={{
                x:      { duration: S.vibrateDurS, repeat: Infinity, ease: 'linear' },
                rotate: { duration: S.vibrateDurS, repeat: Infinity, ease: 'linear' },
                skewX:  { duration: 0 },
              }}
              style={{ ...wordStyle, pointerEvents: 'none', userSelect: 'none' }}
            >
              {item.word}
            </motion.span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Snap-judge the word on this trial's axis — poles rotate across the
          session (the "trick"); their left/right position is randomized */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: S.buttonGap, width: '100%', maxWidth: S.maxW }}>
        {order.map(i => (
          <ResponseButton
            key={i}
            label={item.poles[i]}
            active={picked === i}
            dimmed={picked !== null && picked !== i}
            reduced={reduced}
            onTap={() => answer(i)}
          />
        ))}
      </div>

      {/* Progress — reddens as adaptive pressure climbs (the daemon leaning in) */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: S.progressHeight, background: 'var(--border)' }}>
        <motion.div
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: reduced ? 0 : S.progressAnimS }}
          style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: 'var(--accent)' }}
        />
        <motion.div
          animate={{ width: `${progress * 100}%`, opacity: pressure }}
          transition={{ duration: reduced ? 0 : S.progressAnimS }}
          style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: S.progressHigh }}
        />
      </div>
    </motion.div>
  )
}

function ResponseButton({ label, active, dimmed, reduced, onTap }: { label: string; active: boolean; dimmed: boolean; reduced: boolean; onTap: () => void }) {
  // On select the chosen pole fills + pops; the unchosen one dims — a "logged" beat.
  return (
    <motion.button
      onClick={onTap}
      whileTap={reduced ? undefined : { scale: S.tapScale }}
      animate={{ scale: active && !reduced ? S.selectPopScale : 1, opacity: dimmed ? S.dimmedAlpha : 1 }}
      transition={{ duration: reduced ? 0 : S.selectPopS }}
      style={{
        flex: 1,
        minHeight: Math.max(S.buttonMinH, MIN_TOUCH_TARGET),
        background: active ? 'var(--accent)' : 'transparent',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-active)'}`,
        borderRadius: 'var(--radius-md)',
        color: active ? S.selectFillText : 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        cursor: 'pointer',
        transition: `color ${S.flashMs}ms, background ${S.flashMs}ms, border-color ${S.flashMs}ms`,
      }}
    >
      {label}
    </motion.button>
  )
}
