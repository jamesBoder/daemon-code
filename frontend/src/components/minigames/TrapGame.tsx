import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { copy } from '../../lib/copy'
import { LETTER_SPACING_WIDE } from '../../lib/constants'
import { MG } from '../../lib/minigame'
import { pulseGrain } from '../../lib/grain'
import { DecodeText } from '../daemon/DecodeText'

export interface TrapChoice {
  id:    string
  label: string
  sub:   string
}

interface Props {
  trapId:   string
  kind:     'odds' | 'sunk' | 'overconfidence'
  scenario: string
  /** odds: the certain pot. */
  stake?:   number
  /** sunk: the locked, already-spent amount. */
  sunk?:    number
  /** odds: probability of the upside, shown on the bar. */
  winProb?: number
  /** odds: which terminal ('a'|'b') carries the odds bar (position is randomized). */
  riskSide?: 'a' | 'b'
  /** choice traps: the two options (a = left terminal, b = right). */
  choiceA?: TrapChoice
  choiceB?: TrapChoice
  /** overconfidence: slider runs 1..max. */
  max?:     number
  onComplete: (responseData: unknown) => void
}

const T  = MG.trap
const TR = MG.track

// The Trap is the only fragment with a right answer. It frames in amber (--warning)
// with mono numbers to read as the computational, high-stakes game, distinct from
// every "no wrong answer" fragment. Three kinds: odds (loss aversion) and sunk
// (sunk cost) are two-terminal choices; overconfidence is a pre-session estimate.
// No in-moment verdict — on commit the grain swells and a silent "logged." plays.
export function TrapGame(props: Props) {
  const { trapId, kind, scenario, onComplete } = props
  const reduced = useReducedMotion()

  const [committed, setCommitted] = useState(false)
  const [chosenId, setChosenId]   = useState<string | null>(null)
  // Reset after first paint so the clock starts when the dilemma is visible, not
  // during the route-transition fade-in. Mirrors PredictionDuel's mountTimeRef.
  const mountTimeRef  = useRef(0)
  useEffect(() => { mountTimeRef.current = Date.now() }, [])
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  function commit(responseData: Record<string, unknown>) {
    if (committed) return
    setCommitted(true)
    pulseGrain() // the grain swells the moment the daemon notes the wager
    setTimeout(() => {
      onCompleteRef.current({ trap_id: trapId, response_time_ms: Date.now() - mountTimeRef.current, ...responseData })
    }, reduced ? 0 : T.loggedHoldMs)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-8)', gap: 'var(--space-6)',
      userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      {/* Scenario — the only Fraunces line; the daemon's framing */}
      <p style={{
        fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
        lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)',
        textAlign: 'center', maxWidth: 320,
      }}>
        {scenario}
      </p>

      {kind === 'overconfidence'
        ? <OverconfidenceEstimate max={props.max ?? 10} committed={committed}
            onConfirm={(predicted) => commit({ predicted })} />
        : <ChoiceTerminals {...props} committed={committed} chosenId={chosenId}
            onPick={(c) => { setChosenId(c.id); commit({ choice: c.id }) }} />}

      {/* Silent commit beat — never a verdict. The daemon logs and says nothing. */}
      <div style={{ minHeight: 'var(--space-6)' }} aria-live="polite">
        {committed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : T.loggedFadeS }}>
            <DecodeText text={copy.trap.logged} style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)', letterSpacing: LETTER_SPACING_WIDE,
            }} />
          </motion.div>
        )}
      </div>
    </div>
  )
}

// ── Choice terminals (odds / sunk) ──────────────────────────────────────────
function ChoiceTerminals({ kind, stake, sunk, winProb, riskSide, choiceA, choiceB, committed, chosenId, onPick }: Props & {
  committed: boolean
  chosenId: string | null
  onPick: (c: TrapChoice) => void
}) {
  const reduced = useReducedMotion()
  const winPct  = Math.max(0, Math.min(100, winProb ?? 0))
  const terminals = [choiceA, choiceB].filter(Boolean) as TrapChoice[]

  return (
    <>
      {/* Stake ledger — the personal number on the line */}
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: T.frame, letterSpacing: LETTER_SPACING_WIDE }}>
        {kind === 'odds' ? `${copy.trap.onTable} — ${stake} fragments` : `${copy.trap.sunk} — ${sunk}`}
      </p>

      {/* Locked "sunk" meter — already spent, rendered inert: the bias is anchoring
          on this instead of comparing the two forward returns below. */}
      {kind === 'sunk' && (
        <div aria-hidden="true" style={{
          width: '100%', maxWidth: T.maxW, height: T.meterH,
          borderRadius: 'var(--radius-full)', background: 'var(--text-muted)', opacity: T.meterOpacity,
        }} />
      )}

      <div style={{ display: 'flex', gap: T.terminalGap, width: '100%', maxWidth: T.maxW }}>
        {terminals.map((c, i) => {
          const isChosen   = chosenId === c.id
          const isUnchosen = committed && !isChosen
          const isRiskSide = kind === 'odds' && riskSide === (i === 0 ? 'a' : 'b')
          return (
            <motion.button
              key={c.id}
              onClick={() => onPick(c)}
              disabled={committed}
              whileTap={committed ? {} : { scale: 0.97 }}
              aria-label={`${c.label}, ${c.sub}`}
              style={{
                flex: 1, minHeight: T.terminalMinH,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
                padding: 'var(--space-4)', background: 'transparent', borderRadius: 'var(--radius-lg)',
                border: `0.5px solid ${isChosen ? T.frame : 'var(--border-active)'}`,
                boxShadow: isChosen ? `0 0 16px ${T.frame}40` : undefined,
                opacity: isUnchosen ? T.dimAlpha : 1,
                cursor: committed ? 'default' : 'pointer',
                transition: `border-color ${T.commitFlashMs}ms ease, box-shadow ${T.commitFlashMs}ms ease, opacity ${T.commitFlashMs}ms ease`,
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: isChosen ? T.frame : 'var(--warning)', letterSpacing: LETTER_SPACING_WIDE }}>
                {c.label}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)', color: 'var(--text-primary)', lineHeight: 1 }}>
                {c.sub}
              </span>
              {isRiskSide && (
                <div aria-hidden="true" style={{
                  width: '100%', height: T.oddsBarH, marginTop: 'var(--space-1)',
                  borderRadius: 'var(--radius-full)', overflow: 'hidden', background: T.oddsLoss, display: 'flex',
                }}>
                  <motion.div
                    initial={{ width: reduced ? `${winPct}%` : 0 }}
                    animate={{ width: `${winPct}%` }}
                    transition={{ duration: reduced ? 0 : T.oddsBarFillS, ease: 'easeOut' }}
                    style={{ height: '100%', background: T.oddsGain }}
                  />
                </div>
              )}
            </motion.button>
          )
        })}
      </div>
    </>
  )
}

// ── Overconfidence estimate (pre-session slider) ────────────────────────────
function OverconfidenceEstimate({ max, committed, onConfirm }: {
  max: number
  committed: boolean
  onConfirm: (predicted: number) => void
}) {
  const reduced = useReducedMotion()
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragMax, setDragMax] = useState<number>(TR.dragMaxFallback)
  // Initialize to the value the centered handle (dragX = 0 → 0.5) maps to, so the
  // readout and handle agree before the first interaction.
  const [predicted, setPredicted] = useState(() => 1 + Math.round(0.5 * (max - 1)))

  useLayoutEffect(() => {
    if (!trackRef.current) return
    setDragMax(Math.floor(trackRef.current.getBoundingClientRect().width / 2) - TR.edgeInset)
  }, [])

  const dragX = useMotionValue(0)
  const value = useTransform(dragX, [-dragMax, dragMax], [0, 1])

  // 1..max, snapped to whole numbers.
  function fromValue(v: number): number {
    return 1 + Math.round(Math.max(0, Math.min(1, v)) * (max - 1))
  }
  function sync() { setPredicted(fromValue(value.get())) }
  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const clamped = Math.max(-dragMax, Math.min(dragMax, e.clientX - (rect.left + rect.width / 2)))
    animate(dragX, clamped, reduced ? { duration: 0 } : { type: 'spring', ...MG.spring })
    setPredicted(fromValue((clamped + dragMax) / (2 * dragMax)))
  }

  return (
    <>
      {/* Big amber readout — the estimate */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', color: T.frame }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xl)', lineHeight: 1 }}>{predicted}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', letterSpacing: LETTER_SPACING_WIDE }}>
          {copy.trap.estimateUnit}
        </span>
      </div>

      <div style={{ width: '100%', maxWidth: T.maxW, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div ref={trackRef} onClick={handleTrackClick} style={{ position: 'relative', width: '100%', height: TR.height, cursor: 'ew-resize' }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--border)', transform: 'translateY(-50%)' }} />
          <motion.div
            drag="x"
            dragConstraints={{ left: -dragMax, right: dragMax }}
            dragElastic={TR.dragElastic}
            onDrag={sync}
            onDragEnd={sync}
            whileDrag={{ scale: TR.handleScale }}
            style={{
              x: dragX,
              position: 'absolute', top: '50%', left: `calc(50% - ${TR.handleSize / 2}px)`, marginTop: -(TR.handleSize / 2),
              width: TR.handleSize, height: TR.handleSize, borderRadius: '50%',
              border: `${TR.handleBorderW}px solid ${T.frame}`, background: 'var(--surface-elevated)',
              cursor: 'ew-resize', touchAction: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE }}>{copy.trap.estimateLow}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE }}>{copy.trap.estimateHigh}</span>
        </div>
      </div>

      {!committed && (
        <button onClick={() => onConfirm(predicted)} className="daemon-btn daemon-btn-primary" style={{ width: '100%', maxWidth: TR.confirmMaxW }}>
          {copy.trap.estimateConfirm}
        </button>
      )}
    </>
  )
}
