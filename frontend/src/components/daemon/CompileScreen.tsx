import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useCompileAnimation } from '../../hooks/useCompileAnimation'
import { DaemonOrb } from './DaemonOrb'
import { DaemonProse } from './DaemonProse'
import { SignalWhisper } from './SignalWhisper'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { copy } from '../../lib/copy'
import { COMPILE_AUTOPLAY_DELAY, HAIRLINE, LETTER_SPACING_COMPILE, LETTER_SPACING_TIGHT, MAX_CONTENT_WIDTH, PROSE_MAX_WIDTH } from '../../lib/constants'
import type { CompileData } from '../../types'

const TERM = {
  // Slow float on terminal block (respects reduced motion)
  floatY:           2,
  floatDurationS:   14,
  floatDelay:       1.5,
  // Scan line — sweeps top-to-bottom through the terminal block
  scanHeight:       1,    // px
  scanOpacity:      0.45, // intentionally visible; on dark bg this is a thin bright line
  scanDurationS:    6,
  scanRepeatDelay:  12,
  // Character glitch — NOT gated on reduced motion (text swap ≠ vestibular trigger)
  glitchMinMs:      1200, // fires within 1.2–5s so it's clearly noticeable
  glitchMaxMs:      5000,
  glitchHoldMs:     110,
  // Stat value breath — gated on reduced motion
  statBreathMin:    0.40,
  statBreathBase:   2.8,
  statBreathStep:   0.55,
  statBreathDelay:  0.8,
  statBreathStagger:1.0,
  // Signal author breath — NOT gated (just opacity of a decorative attribution)
  authorBreathMin:  0.45,
  authorBreathDur:  3.5,
} as const

const GLITCH_CHARS = '!@#$%^*<>?|/[]{}▓▒'
const MAX_COMPILE_LINE = 64

interface CompileScreenProps {
  data:          CompileData
  autoPlay?:     boolean
  audioUrl?:     string
  audioPlaying?: boolean
  onMicClick?:   () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickRandomLines(pool: readonly string[], count: number): string[] {
  const src = [...pool]
  const out: string[] = []
  for (let i = 0; i < count && src.length > 0; i++) {
    out.push(src.splice(Math.floor(Math.random() * src.length), 1)[0])
  }
  return out
}

// ── GlitchText ────────────────────────────────────────────────────────────────
// Periodically replaces one character with a random glyph for TERM.glitchHoldMs.
// Deliberately NOT gated on reduced motion — text character swaps are not motion.

function GlitchText({ text }: { text: string }) {
  const [display, setDisplay] = useState(text)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    function schedule() {
      const delay = TERM.glitchMinMs + Math.random() * (TERM.glitchMaxMs - TERM.glitchMinMs)
      timerRef.current = setTimeout(() => {
        const candidates = [...text]
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => c !== ' ' && c !== '>' && c !== '.')
        if (candidates.length === 0) { schedule(); return }

        const { i } = candidates[Math.floor(Math.random() * candidates.length)]
        const glyph = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
        setDisplay(text.slice(0, i) + glyph + text.slice(i + 1))
        setTimeout(() => { setDisplay(text); schedule() }, TERM.glitchHoldMs)
      }, delay)
    }
    schedule()
    return () => clearTimeout(timerRef.current)
  }, [text])

  return <>{display}</>
}

// ── BlinkCursor ───────────────────────────────────────────────────────────────
// Standard terminal cursor — NOT gated on reduced motion.

function BlinkCursor() {
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 1.0, repeat: Infinity, times: [0, 0.5, 1], ease: 'linear' }}
      style={{ color: 'var(--compile-green)', marginLeft: '0.3em' }}
    >
      ▋
    </motion.span>
  )
}

// ── ScanLine ──────────────────────────────────────────────────────────────────

function ScanLine({ reduced }: { reduced: boolean }) {
  if (reduced) return null
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, top: '0%' }}
      animate={{
        top:     ['0%',               '0%',                '100%',              '100%'],
        opacity: [0, TERM.scanOpacity, TERM.scanOpacity,    0],
      }}
      transition={{
        duration:    TERM.scanDurationS,
        times:       [0, 0.06, 0.94, 1],
        repeat:      Infinity,
        repeatDelay: TERM.scanRepeatDelay,
        ease:        'linear',
      }}
      style={{
        position:   'absolute',
        left:       0,
        right:      0,
        height:     TERM.scanHeight,
        background: 'linear-gradient(90deg, transparent 0%, var(--compile-green) 50%, transparent 100%)',
        pointerEvents: 'none',
      }}
    />
  )
}

// ── CompileScreen ─────────────────────────────────────────────────────────────

export function CompileScreen({ data, autoPlay = true, audioUrl, audioPlaying, onMicClick }: CompileScreenProps) {
  const { containerRef, play } = useCompileAnimation()
  const reduced   = useReducedMotion()
  const [orbPulsing, setOrbPulsing] = useState(false)

  // Use Analyst-generated lines when available; fall back to random pool.
  const poolFills = useRef<string[] | undefined>(undefined)
  if (!poolFills.current) {
    poolFills.current = pickRandomLines(copy.compile.logPool, 3)
  }
  const [r0, r1, r2] = (data.compileLogLines && data.compileLogLines.length >= 3)
    ? data.compileLogLines.map(l => l.length > MAX_COMPILE_LINE ? l.slice(0, MAX_COMPILE_LINE - 1) + '…' : l)
    : poolFills.current
  const streakLine = copy.compile.streakLine(data.consecutiveDays, data.day)

  const compileLines = [
    r0,
    copy.compile.signalLine(data.processingSignals),
    r1,
    copy.compile.analystLine(data.analystTime),
    ...(streakLine ? [streakLine] : [r2]),
  ]

  useEffect(() => {
    if (autoPlay) {
      const delay = reduced ? 0 : COMPILE_AUTOPLAY_DELAY
      const t = setTimeout(() => play(() => setOrbPulsing(true)), delay)
      return () => clearTimeout(t)
    }
  }, [autoPlay, play, reduced])

  return (
    <div
      ref={containerRef}
      style={{
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           'var(--space-8)',
        padding:       'var(--space-8) var(--space-5)',
        maxWidth:      MAX_CONTENT_WIDTH,
        margin:        '0 auto',
        width:         '100%',
      }}
    >
      {/* Orb */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', width: '100%' }}>
        <DaemonOrb state={data.orbState} size={180} compilePulse={orbPulsing} />
        <SignalWhisper
          hintKey="orb_warming"
          text={copy.signalHints.orb_warming}
          condition={data.orbState === 'warming'}
        />
      </div>

      {/* Terminal block — slow float (reduced-motion-gated) + scan line + glitch text */}
      <motion.div
        style={{ width: '100%', position: 'relative', overflow: 'hidden' }}
        animate={reduced ? {} : { y: [0, -TERM.floatY, 0] }}
        transition={{ duration: TERM.floatDurationS, repeat: Infinity, ease: 'easeInOut', delay: TERM.floatDelay }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {compileLines.map((line, i) => (
            <p
              key={i}
              data-compile-line
              style={{
                fontFamily:    'var(--font-mono)',
                fontSize:      'var(--text-mono)',
                lineHeight:    'var(--leading-mono)',
                color:         'var(--text-muted)',
                letterSpacing: LETTER_SPACING_COMPILE,
                opacity:       autoPlay ? 0 : 1,
              }}
            >
              <GlitchText text={line} />
            </p>
          ))}

          {/* Compile complete + cursor — cursor NOT gated on reduced motion */}
          <div data-compile-line style={{ opacity: autoPlay ? 0 : 1 }}>
            <p style={{
              fontFamily:    'var(--font-mono)',
              fontSize:      'var(--text-mono)',
              lineHeight:    'var(--leading-mono)',
              color:         'var(--compile-green)',
              letterSpacing: LETTER_SPACING_COMPILE,
              marginTop:     'var(--space-2)',
            }}>
              {copy.compile.complete}
              <BlinkCursor />
            </p>
            <div style={{ height: HAIRLINE, background: 'var(--border)', margin: 'var(--space-2) 0' }} />
          </div>

          {/* Stats — value spans breathe (reduced-motion-gated); GSAP owns the parent div */}
          {data.stats.map((stat, i) => {
            const deltaColor = stat.delta !== undefined
              ? (stat.delta >= 0 ? 'var(--compile-green)' : 'var(--warning)')
              : undefined
            const deltaSign = stat.delta !== undefined && stat.delta > 0 ? '+' : ''
            return (
              <div
                key={i}
                data-compile-stats
                style={{ display: 'flex', justifyContent: 'space-between', opacity: autoPlay ? 0 : 1 }}
              >
                <span style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize:   'var(--text-sm)',
                  lineHeight: 'var(--leading-sm)',
                  color:      'var(--text-secondary)',
                }}>
                  {stat.label}
                </span>
                <motion.span
                  animate={!reduced ? { opacity: [1, TERM.statBreathMin, 1] } : { opacity: 1 }}
                  transition={!reduced ? {
                    duration: TERM.statBreathBase + i * TERM.statBreathStep,
                    repeat:   Infinity,
                    ease:     'easeInOut',
                    delay:    TERM.statBreathDelay + i * TERM.statBreathStagger,
                  } : undefined}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize:   'var(--text-mono)',
                    lineHeight: 'var(--leading-mono)',
                    color:      'var(--compile-green)',
                  }}
                >
                  {stat.text ?? (
                    <>
                      {stat.value}{stat.suffix ?? ''}
                      {stat.delta !== undefined && stat.delta !== 0 && (
                        <span style={{ color: deltaColor }}>
                          {' '}({deltaSign}{stat.delta})
                        </span>
                      )}
                    </>
                  )}
                </motion.span>
              </div>
            )
          })}
        </div>

        <ScanLine reduced={reduced} />
      </motion.div>

      {/* Daemon prose */}
      <div
        data-compile-prose
        style={{ opacity: autoPlay ? 0 : 1, textAlign: 'center', maxWidth: PROSE_MAX_WIDTH, width: '100%' }}
      >
        <DaemonProse
          text={data.daemonProse}
          animate={false}
          showMicIcon={!!audioUrl}
          audioPlaying={audioPlaying}
          onMicClick={onMicClick}
        />
        {data.shadowPrompt && (
          <>
            <p style={{
              fontFamily:    'var(--font-display)',
              fontSize:      'var(--text-sm)',
              lineHeight:    'var(--leading-sm)',
              fontWeight:    300,
              color:         'var(--text-muted)',
              fontStyle:     'italic',
              letterSpacing: LETTER_SPACING_TIGHT,
              marginTop:     'var(--space-5)',
            }}>
              {data.shadowPrompt}
            </p>
            <SignalWhisper
              hintKey="shadow_prompt"
              text={copy.signalHints.shadow_prompt}
            />
          </>
        )}
      </div>

      {/* Daily Signal — author line glitches + quote breathes; both stay visible after animation */}
      <div
        data-compile-signal
        className="glass-card"
        style={{ width: '100%', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5) var(--space-6)', opacity: autoPlay ? 0 : 1 }}
      >
        {/* Quote — slow opacity breath, NOT gated on reduced motion */}
        <motion.p
          animate={{ opacity: [1, 0.55, 1] }}
          transition={{ duration: TERM.authorBreathDur, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
          style={{
            fontFamily:    'var(--font-display)',
            fontSize:      'var(--text-sm)',
            lineHeight:    'var(--leading-sm)',
            fontWeight:    300,
            color:         'var(--text-daemon)',
            fontStyle:     'italic',
            letterSpacing: LETTER_SPACING_TIGHT,
            marginBottom:  'var(--space-2)',
          }}
        >
          "{data.dailySignalQuote}"
        </motion.p>

        {/* Author — glitches on the same fast schedule as compile lines */}
        <p style={{
          fontFamily:    'var(--font-mono)',
          fontSize:      'var(--text-mono)',
          lineHeight:    'var(--leading-mono)',
          color:         'var(--text-muted)',
          letterSpacing: LETTER_SPACING_COMPILE,
        }}>
          — <GlitchText text={data.dailySignalAuthor} />
        </p>
      </div>
    </div>
  )
}
