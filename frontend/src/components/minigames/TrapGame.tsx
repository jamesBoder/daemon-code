import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
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

export interface TrapResult {
  trap_id:          string
  choice:           string
  response_time_ms: number
}

interface Props {
  trapId:   string
  kind:     'odds' | 'sunk'
  scenario: string
  /** odds: the certain pot. */
  stake?:   number
  /** sunk: the locked, already-spent amount. */
  sunk?:    number
  /** odds: probability of the upside, shown on the bar. */
  winProb?: number
  /** Always the bait (Hold / Continue). */
  choiceA:  TrapChoice
  /** Always the rational move (Risk / Abandon). For odds, the gamble the bar describes. */
  choiceB:  TrapChoice
  onComplete: (result: TrapResult) => void
}

const T = MG.trap

// The Trap is the only fragment with a right answer — the math/forward-value is
// on screen and the daemon knows the better move. It frames in amber (--warning)
// with mono numbers to read as the computational, high-stakes game, distinct from
// every "no wrong answer" fragment. No in-moment verdict: on commit it flashes,
// the grain swells, and a silent "logged." beat plays before advancing.
export function TrapGame({ trapId, kind, scenario, stake, sunk, winProb, choiceA, choiceB, onComplete }: Props) {
  const reduced = useReducedMotion()

  const [chosen, setChosen] = useState<string | null>(null)
  // Reset after first paint so the clock starts when the dilemma is visible, not
  // during the route-transition fade-in. Mirrors PredictionDuel's mountTimeRef.
  const mountTimeRef  = useRef(0)
  useEffect(() => { mountTimeRef.current = Date.now() }, [])
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  function commit(choice: TrapChoice) {
    if (chosen) return
    const response_time_ms = Date.now() - mountTimeRef.current
    setChosen(choice.id)
    pulseGrain() // the grain swells the moment the daemon notes the wager
    setTimeout(() => {
      onCompleteRef.current({ trap_id: trapId, choice: choice.id, response_time_ms })
    }, reduced ? 0 : T.loggedHoldMs)
  }

  const winPct = Math.max(0, Math.min(100, winProb ?? 0))

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-8)', gap: 'var(--space-6)',
    }}>
      {/* Scenario — the only Fraunces line; the daemon's framing */}
      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize:   'var(--text-xl)',
        lineHeight: 'var(--leading-xl)',
        color:      'var(--text-primary)',
        textAlign:  'center',
        maxWidth:   320,
      }}>
        {scenario}
      </p>

      {/* Stake ledger — the personal number on the line */}
      <p style={{
        fontFamily:    'var(--font-mono)',
        fontSize:      'var(--text-xs)',
        color:         T.frame,
        letterSpacing: LETTER_SPACING_WIDE,
      }}>
        {kind === 'odds'
          ? `${copy.trap.onTable} — ${stake} fragments`
          : `${copy.trap.sunk} — ${sunk}`}
      </p>

      {/* Locked "sunk" meter — already spent, rendered inert: the bias is anchoring
          on this instead of comparing the two forward returns below. */}
      {kind === 'sunk' && (
        <div
          aria-hidden="true"
          style={{
            width: '100%', maxWidth: T.maxW, height: T.meterH,
            borderRadius: 'var(--radius-full)',
            background: 'var(--text-muted)',
            opacity: T.meterOpacity,
          }}
        />
      )}

      {/* The two decision terminals */}
      <div style={{ display: 'flex', gap: T.terminalGap, width: '100%', maxWidth: T.maxW }}>
        {[choiceA, choiceB].map((c, i) => {
          const isChosen   = chosen === c.id
          const isUnchosen = chosen !== null && !isChosen
          const isRiskSide = kind === 'odds' && i === 1 // choiceB is the gamble
          return (
            <motion.button
              key={c.id}
              onClick={() => commit(c)}
              disabled={chosen !== null}
              whileTap={chosen === null ? { scale: 0.97 } : {}}
              aria-label={`${c.label}, ${c.sub}`}
              style={{
                flex: 1, minHeight: T.terminalMinH,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
                padding: 'var(--space-4)',
                background: 'transparent',
                borderRadius: 'var(--radius-lg)',
                border: `0.5px solid ${isChosen ? T.frame : 'var(--border-active)'}`,
                boxShadow: isChosen ? `0 0 16px ${T.frame}40` : undefined,
                opacity: isUnchosen ? T.dimAlpha : 1,
                cursor: chosen === null ? 'pointer' : 'default',
                transition: `border-color ${T.commitFlashMs}ms ease, box-shadow ${T.commitFlashMs}ms ease, opacity ${T.commitFlashMs}ms ease`,
              }}
            >
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                color: isChosen ? T.frame : 'var(--warning)',
                letterSpacing: LETTER_SPACING_WIDE,
              }}>
                {c.label}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)',
                color: 'var(--text-primary)', lineHeight: 1,
              }}>
                {c.sub}
              </span>

              {/* Odds bar — probability rendered spatially, under the risk side */}
              {isRiskSide && (
                <div
                  aria-hidden="true"
                  style={{
                    width: '100%', height: T.oddsBarH, marginTop: 'var(--space-1)',
                    borderRadius: 'var(--radius-full)', overflow: 'hidden',
                    background: T.oddsLoss, display: 'flex',
                  }}
                >
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

      {/* Silent commit beat — never a verdict. The daemon logs and says nothing. */}
      <div style={{ minHeight: 'var(--space-6)' }} aria-live="polite">
        {chosen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : T.loggedFadeS }}
          >
            <DecodeText
              text={copy.trap.logged}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize:   'var(--text-xs)',
                color:      'var(--text-secondary)',
                letterSpacing: LETTER_SPACING_WIDE,
              }}
            />
          </motion.div>
        )}
      </div>
    </div>
  )
}
