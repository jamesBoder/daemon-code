import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { BlinkCursor } from '../components/ui/BlinkCursor'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { WeightedScale } from '../components/minigames/WeightedScale'
import { PredictionDuel } from '../components/minigames/PredictionDuel'
import { getPulseToday, postPulseResponse, type PulseStimulus } from '../lib/api'
import { PULSE_REACTION_WINDOW_MS, PROSE_MAX_WIDTH, HAIRLINE, LETTER_SPACING_WIDE, LETTER_SPACING_PROCESS, SCREEN_HEADER_HEIGHT, MIN_TOUCH_TARGET } from '../lib/constants'
import type { OrbState, HomeData } from '../types'

const PHASE_FADE = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
const PHASE_DUR  = 0.35

type Phase = 0 | 1 | 2 | 3

const PULSE = {
  orbSize:          80,
  noteDelay:        600,   // ms before auto-advance from Phase 0
  observeDelay:     400,   // ms after observation before separator appears
  separatorDelay:   200,   // ms after separator before label appears
  labelDelay:       200,   // ms after label before word grid appears
  wordSelectDelay:  600,   // ms after word selection before advancing
  noneSelectDelay:  400,
  notedDuration:    1200,  // ms on "noted." before auto-navigate
  wordColumns:      2,
  wordRows:         3,
  ringSize:         80,
  separatorWidth:   48,    // px width of the hairline separator in Phase 2
  obseFadeS:        0.6,   // observation text fade-in duration (s)
  elemFadeS:        0.4,   // separator / label / grid fade-in duration (s)
  chipFadeS:        0.25,  // word chip stagger fade-in duration (s)
  chipStaggerS:     0.04,  // per-chip entrance stagger delay multiplier (s)
  noneDelayS:       0.3,   // "none of these" entrance delay (s)
  notedFadeS:       0.3,   // Phase 3 "noted." fade duration (s)
} as const

export function Pulse() {
  const navigate     = useNavigate()
  const qc           = useQueryClient()
  const reduced      = useReducedMotion()

  const [phase,        setPhase]        = useState<Phase>(0)
  const [resultBucket, setResultBucket] = useState<string>('')
  const submittedRef        = useRef(false)
  const phase1StartRef      = useRef(0)  // Date.now() when Phase 1 becomes active
  const stimulusDurationRef = useRef(0)  // ms from Phase 1 entry to stimulus completion

  const { data: pulse, isError } = useQuery({
    queryKey: ['pulse'],
    queryFn:  getPulseToday,
    staleTime: 0,
  })

  const homeData = qc.getQueryData<HomeData>(['home'])
  const orbState: OrbState = homeData?.orbState ?? 'cold'

  const mutation = useMutation({
    mutationFn: postPulseResponse,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pulse'] })
    },
  })

  // Phase 0 → Phase 1 auto-advance
  useEffect(() => {
    if (phase !== 0) return
    const t = setTimeout(() => {
      phase1StartRef.current = Date.now()
      setPhase(1)
    }, reduced ? 0 : PULSE.noteDelay)
    return () => clearTimeout(t)
  }, [phase, reduced])

  // Phase 3 auto-navigate
  useEffect(() => {
    if (phase !== 3) return
    const t = setTimeout(() => navigate('/home', { replace: true }), PULSE.notedDuration)
    return () => clearTimeout(t)
  }, [phase, navigate])

  // Redirect to home if no pulse available or error
  useEffect(() => {
    if (isError) navigate('/home', { replace: true })
  }, [isError, navigate])

  // Redirect to home if pulse loaded but has no stimulus (already completed or outside run gate)
  useEffect(() => {
    if (pulse && !pulse.stimulus) navigate('/home', { replace: true })
  }, [pulse, navigate])

  if (!pulse && !isError) {
    // Still loading — Phase 0 (reading.) already shows while we wait
  }

  const stimulus = pulse?.stimulus

  const handleStimulusResult = (bucket: string) => {
    stimulusDurationRef.current = phase1StartRef.current > 0 ? Date.now() - phase1StartRef.current : 0
    setResultBucket(bucket)
    setPhase(2)
  }

  const handleWordComplete = (word: string | null) => {
    if (submittedRef.current || !stimulus) return
    submittedRef.current = true
    setPhase(3)
    // Fire-and-forget: if it fails, the user already sees "noted." — no blocking
    mutation.mutate({
      stimulus_id:   stimulus.stimulus_id,
      stimulus_type: stimulus.type,
      result_bucket: resultBucket,
      duration_ms:   stimulusDurationRef.current,
      word_selected: word,
    })
  }

  const handleBack = () => navigate('/home', { replace: true })

  const observation = stimulus ? (stimulus.daemon_observations[resultBucket] ?? '') : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      {/* ScreenHeader hidden during full-screen WeightedScale/PredictionDuel (Phase 1 pair types) */}
      {!(phase === 1 && stimulus && stimulus.type !== 'reaction_test') && (
        <ScreenHeader title="" onBack={handleBack} />
      )}

      <div style={{ flex: 1, position: 'relative' }}>
        <AnimatePresence mode="wait">
          {phase === 0 && (
            <PhaseReading key="p0" orbState={orbState} reduced={reduced} />
          )}

          {phase === 1 && stimulus && (
            <PhaseStimulus
              key="p1"
              stimulus={stimulus}
              reduced={reduced}
              onComplete={handleStimulusResult}
              onBack={handleBack}
            />
          )}

          {phase === 2 && stimulus && (
            <PhaseObserve
              key="p2"
              observation={observation}
              wordOptions={pulse?.word_options ?? []}
              reduced={reduced}
              onComplete={handleWordComplete}
            />
          )}

          {phase === 3 && (
            <PhaseNoted key="p3" onTap={() => navigate('/home', { replace: true })} />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Phase 0 — "reading." ─────────────────────────────────────────────────────

function PhaseReading({ orbState, reduced }: { orbState: OrbState; reduced: boolean }) {
  return (
    <motion.div
      key="reading"
      {...PHASE_FADE}
      transition={{ duration: reduced ? 0 : PHASE_DUR }}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 'var(--space-4)',
      }}
    >
      <DaemonOrb state={orbState} size={PULSE.orbSize} />
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize:   'var(--text-xs)',
        color:      'var(--text-muted)',
        letterSpacing: LETTER_SPACING_WIDE,
      }}>
        reading.
      </p>
    </motion.div>
  )
}

// ── Phase 1 — Stimulus ───────────────────────────────────────────────────────

function PhaseStimulus({
  stimulus,
  reduced,
  onComplete,
  onBack,
}: {
  stimulus: PulseStimulus
  reduced: boolean
  onComplete: (bucket: string) => void
  onBack: () => void
}) {
  if (stimulus.type === 'reaction_test') {
    return (
      <motion.div
        {...PHASE_FADE}
        transition={{ duration: reduced ? 0 : PHASE_DUR }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <ReactionTestStimulus
          word={stimulus.word ?? ''}
          reduced={reduced}
          onComplete={onComplete}
        />
      </motion.div>
    )
  }

  // Shared inline back button — ScreenHeader is suppressed for pair stimuli (needs full 100dvh)
  const inlineBack = (
    <button
      onClick={onBack}
      style={{
        position: 'absolute', top: 'calc(env(safe-area-inset-top) + var(--space-2))',
        left: 'var(--space-4)', zIndex: 10,
        background: 'none', border: 'none',
        fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)', cursor: 'pointer',
        padding: 'var(--space-2)', minHeight: MIN_TOUCH_TARGET,
        display: 'flex', alignItems: 'center',
      }}
    >
      ← back
    </button>
  )

  if (stimulus.type === 'weighted_scale') {
    return (
      <motion.div
        {...PHASE_FADE}
        transition={{ duration: reduced ? 0 : PHASE_DUR }}
        style={{ position: 'absolute', inset: 0 }}
      >
        {inlineBack}
        <WeightedScale
          pairs={[{ left: stimulus.left ?? '', right: stimulus.right ?? '' }]}
          isEmbedded
          onComplete={(results) => {
            const val = results[0]?.value ?? 0
            const bucket = Math.abs(val) > 0.6
              ? (val < 0 ? 'strong_left' : 'strong_right')
              : 'center'
            onComplete(bucket)
          }}
        />
      </motion.div>
    )
  }

  if (stimulus.type === 'prediction_duel') {
    return (
      <motion.div
        {...PHASE_FADE}
        transition={{ duration: reduced ? 0 : PHASE_DUR }}
        style={{ position: 'absolute', inset: 0 }}
      >
        {inlineBack}
        <PredictionDuel
          pattern=""
          prediction={stimulus.daemon_prediction ?? stimulus.scenario ?? ''}
          isEmbedded
          onComplete={(result) => onComplete(result.matched ? 'agree' : 'disagree')}
        />
      </motion.div>
    )
  }

  return null
}

// ── Reaction Test countdown ring ─────────────────────────────────────────────

function ReactionTestStimulus({
  word,
  reduced,
  onComplete,
}: {
  word: string
  reduced: boolean
  onComplete: (bucket: string) => void
}) {
  // Clock starts after the fade-in completes so elapsed time reflects when the word
  // was actually visible, not when the component mounted. Both the ring and the tap
  // clock use the same delay so they remain synchronized with each other.
  const fadeDelayMs  = reduced ? 0 : Math.round(PHASE_DUR * 1000)
  const startRef     = useRef(0) // set after fade; 0 = not yet started
  const completedRef = useRef(false)
  const [progress, setProgress] = useState(1) // 1 = full ring, 0 = empty

  const finish = (bucket: string) => {
    if (completedRef.current) return
    completedRef.current = true
    onComplete(bucket)
  }

  // Animate countdown ring — starts after fade-in
  useEffect(() => {
    if (reduced) return
    let rafId: number
    const timer = setTimeout(() => {
      const start = Date.now()
      startRef.current = start
      const tick = () => {
        const elapsed = Date.now() - start
        const remaining = Math.max(0, 1 - elapsed / PULSE_REACTION_WINDOW_MS)
        setProgress(remaining)
        if (remaining > 0) {
          rafId = requestAnimationFrame(tick)
        } else {
          finish('skip')
        }
      }
      rafId = requestAnimationFrame(tick)
    }, fadeDelayMs)
    return () => { clearTimeout(timer); cancelAnimationFrame(rafId) }
  }, [reduced, fadeDelayMs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tap handler: measure from word-visible time; treat pre-fade taps as 'fast'
  const handleTap = () => {
    const t = startRef.current
    const elapsed = t === 0 ? 0 : Date.now() - t
    const midpoint = PULSE_REACTION_WINDOW_MS / 2
    finish(elapsed < midpoint ? 'fast' : 'slow')
  }

  const ringR      = (PULSE.ringSize - 4) / 2
  const ringCirc   = 2 * Math.PI * ringR
  const dashOffset = ringCirc * (1 - (reduced ? 1 : progress))

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 'var(--space-6)',
        paddingBottom: 'var(--space-16)',
      }}
    >
      {/* Countdown ring */}
      <svg width={PULSE.ringSize} height={PULSE.ringSize} style={{ overflow: 'visible' }}>
        {/* Track */}
        <circle
          cx={PULSE.ringSize / 2}
          cy={PULSE.ringSize / 2}
          r={ringR}
          fill="none"
          stroke="var(--border)"
          strokeWidth={2}
        />
        {/* Countdown arc */}
        <circle
          cx={PULSE.ringSize / 2}
          cy={PULSE.ringSize / 2}
          r={ringR}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={ringCirc}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${PULSE.ringSize / 2} ${PULSE.ringSize / 2})`}
        />
      </svg>

      {/* Tap target: full area above "pass →" */}
      <button
        onClick={handleTap}
        aria-label={`tap to respond to word: ${word}`}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 'var(--space-8)',
        }}
      >
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontSize:   'var(--text-3xl)',
          fontStyle:  'italic',
          color:      'var(--text-daemon)',
        }}>
          {word}
        </span>
      </button>

      {/* Pass */}
      <button
        onClick={() => finish('skip')}
        style={{
          position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + var(--space-6))',
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE,
          padding: 'var(--space-3) var(--space-4)', minHeight: MIN_TOUCH_TARGET,
          display: 'flex', alignItems: 'center',
        }}
      >
        pass →
      </button>
    </div>
  )
}

// ── Phase 2 — Observation + Pick a Word ─────────────────────────────────────

function PhaseObserve({
  observation,
  wordOptions,
  reduced,
  onComplete,
}: {
  observation: string
  wordOptions: string[]
  reduced: boolean
  onComplete: (word: string | null) => void
}) {
  const [showSep,   setShowSep]   = useState(false)
  const [showLabel, setShowLabel] = useState(false)
  const [showGrid,  setShowGrid]  = useState(false)
  const [selected,  setSelected]  = useState<string | null>(null)
  const completedRef = useRef(false)

  useEffect(() => {
    const t1 = setTimeout(() => setShowSep(true),   reduced ? 0 : PULSE.observeDelay)
    const t2 = setTimeout(() => setShowLabel(true),  reduced ? 0 : PULSE.observeDelay + PULSE.separatorDelay)
    const t3 = setTimeout(() => setShowGrid(true),   reduced ? 0 : PULSE.observeDelay + PULSE.separatorDelay + PULSE.labelDelay)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [reduced])

  const handleWordTap = (word: string) => {
    if (completedRef.current) return
    setSelected(word)
    setTimeout(() => {
      if (completedRef.current) return
      completedRef.current = true
      onComplete(word)
    }, reduced ? 0 : PULSE.wordSelectDelay)
  }

  const handleNoneOfThese = () => {
    if (completedRef.current) return
    completedRef.current = true
    setTimeout(() => onComplete(null), reduced ? 0 : PULSE.noneSelectDelay)
  }

  return (
    <motion.div
      {...PHASE_FADE}
      transition={{ duration: reduced ? 0 : PHASE_DUR }}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        padding: 'var(--space-8) var(--space-5)',
        paddingTop: `calc(var(--space-8) + ${SCREEN_HEADER_HEIGHT}px)`, // below ScreenHeader
        gap: 'var(--space-4)',
        overflowY: 'auto',
      }}
    >
      {/* Observation text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : PULSE.obseFadeS }}
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize:   'var(--text-lg)',
          fontStyle:  'italic',
          color:      'var(--text-daemon)',
          textAlign:  'center',
          maxWidth:   PROSE_MAX_WIDTH,
          lineHeight: 'var(--leading-relaxed)',
        }}
      >
        {observation}
      </motion.p>

      {/* Separator */}
      {showSep && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0 : PULSE.elemFadeS }}
          style={{
            width: PULSE.separatorWidth,
            height: HAIRLINE,
            background: 'var(--border)',
          }}
        />
      )}

      {/* "one more signal." label */}
      {showLabel && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0 : PULSE.elemFadeS }}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize:   'var(--text-xs)',
            color:      'var(--text-muted)',
            letterSpacing: LETTER_SPACING_WIDE,
          }}
        >
          one more signal.
        </motion.p>
      )}

      {/* Word grid */}
      {showGrid && (
        <motion.div
          initial={{ opacity: 0, y: reduced ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : PULSE.elemFadeS }}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${PULSE.wordColumns}, 1fr)`,
            gap: 'var(--space-3)',
            width: '100%',
            maxWidth: PROSE_MAX_WIDTH,
          }}
        >
          {wordOptions.map((word, i) => (
            <motion.button
              key={word}
              initial={reduced ? {} : { opacity: 0 }}
              animate={{ opacity: selected && selected !== word ? 0.3 : 1 }}
              transition={{ duration: reduced ? 0 : PULSE.chipFadeS, delay: reduced ? 0 : i * PULSE.chipStaggerS }}
              whileTap={{ scale: 0.94 }}
              onClick={() => handleWordTap(word)}
              aria-label={word}
              style={{
                border: `${HAIRLINE} solid ${selected === word ? 'var(--border-active)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3) var(--space-5)',
                background: selected === word
                  ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                  : 'transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-serif)',
                fontSize:   'var(--text-base)',
                color: selected === word ? 'var(--accent)' : 'var(--text-secondary)',
                textAlign: 'center',
              }}
            >
              {word}
            </motion.button>
          ))}
        </motion.div>
      )}

      {/* "none of these" escape */}
      {showGrid && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: selected ? 0.4 : 1 }}
          transition={{ duration: reduced ? 0 : PULSE.chipFadeS, delay: reduced ? 0 : PULSE.noneDelayS }}
          whileTap={{ opacity: 0.5 }}
          onClick={handleNoneOfThese}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE,
            marginTop: 'var(--space-2)',
            padding: '0 var(--space-4)', minHeight: MIN_TOUCH_TARGET,
            display: 'flex', alignItems: 'center',
          }}
        >
          none of these
        </motion.button>
      )}
    </motion.div>
  )
}

// ── Phase 3 — "noted." ───────────────────────────────────────────────────────

function PhaseNoted({ onTap }: { onTap: () => void }) {
  return (
    <motion.div
      {...PHASE_FADE}
      transition={{ duration: PULSE.notedFadeS }}
      onClick={onTap}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'default',
      }}
    >
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize:   'var(--text-lg)',
        color:      'var(--compile-green)',
        letterSpacing: LETTER_SPACING_PROCESS,
      }}>
        noted.<BlinkCursor />
      </span>
    </motion.div>
  )
}

