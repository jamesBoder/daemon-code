import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ReactionTest, type ReactionTestResult } from '../../components/minigames/ReactionTest'
import { WeightedScale, type WeightedScaleResult } from '../../components/minigames/WeightedScale'
import { SpeedRound, type SpeedRoundResult, type SpeedRoundPrompt } from '../../components/minigames/SpeedRound'
import { DaemonOrb } from '../../components/daemon/DaemonOrb'
import { apiFetch } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { copy } from '../../lib/copy'
import { MG } from '../../lib/minigame'

const COMPILE_LINES = [
  '> initializing daemon_profile...',
  '> processing first signals...',
  '> building initial hypothesis...',
]

// ── Card layout used for context, transition, and first-look steps ────────────
function StepCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-8)',
      gap: 'var(--space-8)',
    }}>
      {children}
    </div>
  )
}

export function Onboarding() {
  const navigate  = useNavigate()
  const { token, setAuth } = useAuthStore()

  const [step, setStep]             = useState(0)
  const [compileLines, setCompileLines] = useState(0)
  const [postError, setPostError]   = useState(false)
  const [postDone, setPostDone]     = useState(false)
  const [timerDone, setTimerDone]   = useState(false)

  // Results collected from each mini-game — stored in refs, not state
  const reactionRef = useRef<ReactionTestResult | null>(null)
  const scaleRef    = useRef<WeightedScaleResult[] | null>(null)
  const speedRef    = useRef<SpeedRoundResult[] | null>(null)

  // Step 6: run compile animation + POST in parallel
  useEffect(() => {
    if (step !== 6) return

    // Reset parallel-gate flags
    setPostDone(false)
    setTimerDone(false)
    setPostError(false)
    setCompileLines(0)

    // Reveal lines one at a time
    const timers = MG.compile.lineDelays.map((delay, i) =>
      setTimeout(() => setCompileLines(i + 1), delay)
    )
    const minTimer = setTimeout(() => setTimerDone(true), MG.compile.minMs)

    // POST onboarding results
    const reaction = reactionRef.current?.tapped ?? []
    const scale    = scaleRef.current    ?? []
    const speed    = speedRef.current    ?? []

    apiFetch('/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({
        responses: {
          reaction_test:   reaction.map(r => ({ word: r.word, reaction_time_ms: r.reactionTimeMs })),
          weighted_scale:  scale,
          speed_round:     speed.map(s => ({ starter: s.starter, chosen: s.chosen, response_time_ms: s.responseTimeMs })),
        },
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        setPostDone(true)
      })
      .catch(() => setPostError(true))

    return () => { timers.forEach(clearTimeout); clearTimeout(minTimer) }
  }, [step])

  // Advance to step 7 when both the timer and POST have completed
  useEffect(() => {
    if (postDone && timerDone) setStep(7)
  }, [postDone, timerDone])

  function retry() {
    const reaction = reactionRef.current?.tapped ?? []
    const scale    = scaleRef.current    ?? []
    const speed    = speedRef.current    ?? []

    setPostError(false)
    apiFetch('/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({
        responses: {
          reaction_test:  reaction.map(r => ({ word: r.word, reaction_time_ms: r.reactionTimeMs })),
          weighted_scale: scale,
          speed_round:    speed.map(s => ({ starter: s.starter, chosen: s.chosen, response_time_ms: s.responseTimeMs })),
        },
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        setPostDone(true)
      })
      .catch(() => setPostError(true))
  }

  function enterDaemon() {
    setAuth(token!, true)
    navigate('/home', { replace: true })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function renderStep() {
    switch (step) {

      // ── Step 0: context card ─────────────────────────────────────────────
      case 0:
        return (
          <StepCard>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)', textAlign: 'center', maxWidth: 320 }}>
              The daemon is watching how you respond.<br />
              Tap when you feel something.
            </p>
            <button className="daemon-btn daemon-btn-primary" style={{ maxWidth: 240 }} onClick={() => setStep(1)}>
              Begin →
            </button>
          </StepCard>
        )

      // ── Step 1: Reaction Test ─────────────────────────────────────────────
      case 1:
        return (
          <ReactionTest
            words={copy.onboarding.reactionWords}
            durationMs={200}
            onComplete={(r) => { reactionRef.current = r; setStep(2) }}
          />
        )

      // ── Step 2: transition card ───────────────────────────────────────────
      case 2:
        return (
          <StepCard>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)', textAlign: 'center', maxWidth: 320 }}>
              The daemon is noting what moved quickly and what moved slowly.
            </p>
            <button className="daemon-btn daemon-btn-primary" style={{ maxWidth: 240 }} onClick={() => setStep(3)}>
              Continue →
            </button>
          </StepCard>
        )

      // ── Step 3: Weighted Scale ────────────────────────────────────────────
      case 3:
        return (
          <WeightedScale
            pairs={copy.onboarding.scalePairs}
            onComplete={(r) => { scaleRef.current = r; setStep(4) }}
          />
        )

      // ── Step 4: transition card ───────────────────────────────────────────
      case 4:
        return (
          <StepCard>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)', textAlign: 'center', maxWidth: 320 }}>
              The daemon is building a first picture.
            </p>
            <button className="daemon-btn daemon-btn-primary" style={{ maxWidth: 240 }} onClick={() => setStep(5)}>
              Continue →
            </button>
          </StepCard>
        )

      // ── Step 5: Speed Round ───────────────────────────────────────────────
      case 5:
        return (
          <SpeedRound
            prompts={copy.onboarding.speedRoundPrompts as SpeedRoundPrompt[]}
            onComplete={(r) => { speedRef.current = r; setStep(6) }}
          />
        )

      // ── Step 6: compile loading ───────────────────────────────────────────
      case 6:
        if (postError) {
          return (
            <StepCard>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--text-primary)', textAlign: 'center', maxWidth: 320 }}>
                Something went wrong. The daemon lost the signal.
              </p>
              <button className="daemon-btn daemon-btn-primary" style={{ maxWidth: 240 }} onClick={retry}>
                Try again →
              </button>
            </StepCard>
          )
        }
        return (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', padding: 'var(--space-8)', gap: 'var(--space-3)' }}>
            {COMPILE_LINES.map((line, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: compileLines > i ? 1 : 0 }}
                transition={{ duration: MG.compile.lineFadeS }}
                style={{ fontFamily: MG.type.mono.family, fontSize: MG.type.mono.size, color: 'var(--compile-green)', letterSpacing: '0.04em' }}
              >
                {line}
              </motion.p>
            ))}
          </div>
        )

      // ── Step 7: first look at daemon ─────────────────────────────────────
      case 7:
        return (
          <StepCard>
            <DaemonOrb state="cold" />
            <p style={{ fontFamily: MG.type.mono.family, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
              Forming · Day 0
            </p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)', textAlign: 'center', maxWidth: 320 }}>
              The daemon has a first impression.<br />
              It will know more tomorrow.
            </p>
            <button className="daemon-btn daemon-btn-primary" style={{ maxWidth: 240 }} onClick={enterDaemon}>
              Enter the daemon →
            </button>
          </StepCard>
        )

      default:
        return null
    }
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: MG.transition.stepMs / 1000, ease: 'easeInOut' }}
        style={{ position: 'fixed', inset: 0 }}
      >
        {renderStep()}
      </motion.div>
    </AnimatePresence>
  )
}
