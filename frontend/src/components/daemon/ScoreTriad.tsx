import { useEffect, useRef, useState } from 'react'
import { HAIRLINE, LETTER_SPACING_WIDE, MIN_TOUCH_TARGET, SCORE_HIGH_ACCURACY_THRESHOLD } from '../../lib/constants'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { ScoreSheet } from './ScoreSheet'
import type { ScoreSheetKey } from '../../lib/copy'

// All geometry and animation values live here — nothing bare in render functions.
const TILE = {
  cardPadH:      'var(--space-5)',
  cardPadV:      'var(--space-4)',
  colPadH:       'var(--space-3)',   // 12px — keeps 60px arc inside 93px min column (320px phone)
  labelSize:     'var(--text-mono)',
  valueSize:     'var(--text-xl)',
  arcValueSize:  'var(--text-sm)',   // number rendered inside the arc ring
  deltaSize:     'var(--text-mono)',
  deltaRadiusPx: 4,
  deltaPadV:     2,
  deltaPadH:     6,
  // Arc ring (kernel access column)
  arcSizePx:     60,                 // 60px fits in 93px min column (320px phone) with colPadH
  arcStrokePx:   2,
  // Progress track (daemon accuracy column)
  trackHPx:      1,
  trackRadiusPx: 999,
  // Animation
  countUpMs:     700,
  easing:        'cubic-bezier(0.4, 0, 0.2, 1)',
} as const

interface ScoreTriadProps {
  kernelAccess:        number
  daemonAccuracy:      number
  decodedLines:        number
  kernelAccessDelta:   number
  daemonAccuracyDelta: number
  decodedLinesDelta:   number
}

export function ScoreTriad({
  kernelAccess,
  daemonAccuracy,
  decodedLines,
  kernelAccessDelta,
  daemonAccuracyDelta,
  decodedLinesDelta,
}: ScoreTriadProps) {
  const reduced        = useReducedMotion()
  const [mounted, setMounted]           = useState(false)
  const [activeScore, setActiveScore]   = useState<ScoreSheetKey | null>(null)
  const kernelDisplay  = useCountUp(kernelAccess, reduced ? 0 : TILE.countUpMs)
  const accuracyDisplay = useCountUp(daemonAccuracy, reduced ? 0 : TILE.countUpMs)
  const linesDisplay   = useCountUp(decodedLines, reduced ? 0 : TILE.countUpMs)
  const accuracyHigh   = daemonAccuracy >= SCORE_HIGH_ACCURACY_THRESHOLD

  useEffect(() => {
    // One-frame delay so initial "empty" paint is visible before CSS transitions fire.
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  return (
    <>
    <div className="glass-card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: `${TILE.cardPadV} ${TILE.cardPadH} 0`,
        marginBottom: 'var(--space-3)',
      }}>
        <span style={{
          fontFamily:    'var(--font-mono)',
          fontSize:      TILE.labelSize,
          color:         'var(--text-muted)',
          letterSpacing: LETTER_SPACING_WIDE,
          textTransform: 'uppercase' as const,
        }}>
          behavioral index
        </span>
      </div>

      {/* Hairline below header */}
      <div style={{ height: HAIRLINE, background: 'var(--border)' }} />

      {/* Three columns */}
      <div style={{ display: 'flex' }}>
        {/* Kernel Access — arc ring */}
        <div style={{ flex: 1, padding: `${TILE.cardPadV} ${TILE.colPadH}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', borderRight: `${HAIRLINE} solid var(--border)` }}>
          <div style={{ position: 'relative', width: TILE.arcSizePx, height: TILE.arcSizePx, flexShrink: 0 }}>
            <ArcRing pct={kernelAccess} fill={reduced || mounted} reduced={reduced} />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize:   TILE.arcValueSize,
                color:      'var(--text-primary)',
                lineHeight: 1,
              }}>
                {kernelDisplay}%
              </span>
            </div>
          </div>

          <ScoreLabel
            label="kernel access"
            onClick={() => setActiveScore('kernel_access')}
            center
          />

          {kernelAccessDelta !== 0 && (
            <DeltaBadge delta={kernelAccessDelta} />
          )}
        </div>

        {/* Daemon Accuracy — progress bar */}
        <div style={{ flex: 1, padding: `${TILE.cardPadV} ${TILE.colPadH}`, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderRight: `${HAIRLINE} solid var(--border)` }}>
          <ScoreLabel
            label="daemon accuracy"
            onClick={() => setActiveScore('daemon_accuracy')}
          />

          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize:   TILE.valueSize,
            color:      accuracyHigh ? 'var(--accent)' : 'var(--text-primary)',
            lineHeight: 1,
          }}>
            {accuracyDisplay}%
          </span>

          {/* Progress track */}
          <div style={{
            width:        '100%',
            height:       TILE.trackHPx,
            background:   'var(--border)',
            borderRadius: TILE.trackRadiusPx,
            overflow:     'hidden',
          }}>
            <div style={{
              height:       '100%',
              borderRadius: TILE.trackRadiusPx,
              background:   accuracyHigh ? 'var(--accent)' : 'var(--compile-green)',
              width:        `${reduced || mounted ? daemonAccuracy : 0}%`,
              transition:   reduced ? 'none' : `width ${TILE.countUpMs}ms ${TILE.easing}`,
            }} />
          </div>

          {daemonAccuracyDelta !== 0 && (
            <DeltaBadge delta={daemonAccuracyDelta} />
          )}
        </div>

        {/* Decoded Lines */}
        <div style={{ flex: 1, padding: `${TILE.cardPadV} ${TILE.colPadH}`, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <ScoreLabel
            label="decoded lines"
            onClick={() => setActiveScore('decoded_lines')}
          />

          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize:   TILE.valueSize,
            color:      'var(--text-primary)',
            lineHeight: 1,
          }}>
            {linesDisplay.toLocaleString()}
          </span>

          {decodedLinesDelta !== 0 && (
            <DeltaBadge delta={decodedLinesDelta} />
          )}
        </div>
      </div>
    </div>

    <ScoreSheet active={activeScore} onClose={() => setActiveScore(null)} />
    </>
  )
}

// ── Score Label (tappable — opens score sheet) ────────────────────────────────

function ScoreLabel({ label, onClick, center }: { label: string; onClick: () => void; center?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={`View ${label} score sheet`}
      style={{
        background:    'none',
        border:        'none',
        padding:       0,
        cursor:        'pointer',
        minHeight:     MIN_TOUCH_TARGET,
        display:       'flex',
        alignItems:    'center',
        justifyContent: center ? 'center' : 'flex-start',
        fontFamily:    'var(--font-mono)',
        fontSize:      TILE.labelSize,
        color:         'var(--text-muted)',
        letterSpacing: LETTER_SPACING_WIDE,
        lineHeight:    'var(--leading-mono)',
        textAlign:     center ? 'center' : 'left',
      }}
    >
      {label}
    </button>
  )
}

// ── Arc Ring ─────────────────────────────────────────────────────────────────

// fill=false → empty ring (pre-transition initial state)
// fill=true  → filled to pct (immediate for reduced motion, via CSS transition otherwise)
function ArcRing({ pct, fill, reduced }: { pct: number; fill: boolean; reduced: boolean }) {
  const SIZE   = TILE.arcSizePx
  const S      = TILE.arcStrokePx
  const R      = (SIZE - S * 2) / 2
  const CIRC   = 2 * Math.PI * R
  const offset = fill ? CIRC - (pct / 100) * CIRC : CIRC

  return (
    <svg
      width={SIZE}
      height={SIZE}
      style={{ display: 'block', transform: 'rotate(-90deg)' }}
      aria-hidden
    >
      {/* Track ring — uses var(--border) via inline style so CSS custom property resolves */}
      <circle
        cx={SIZE / 2} cy={SIZE / 2} r={R}
        fill="none"
        strokeWidth={S}
        style={{ stroke: 'var(--border)' }}
      />
      {/* Fill ring — CSS transition animates dashoffset from CIRC → filled on mount */}
      <circle
        cx={SIZE / 2} cy={SIZE / 2} r={R}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={S}
        strokeLinecap="round"
        strokeDasharray={CIRC}
        strokeDashoffset={offset}
        style={{
          transition: reduced ? 'none' : `stroke-dashoffset ${TILE.countUpMs}ms ${TILE.easing}`,
        }}
      />
    </svg>
  )
}

// ── Delta Badge ───────────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number }) {
  const positive = delta > 0
  const color    = positive ? 'var(--compile-green)' : 'var(--warning)'
  const sign     = positive ? '+' : ''

  return (
    <span style={{
      fontFamily:    'var(--font-mono)',
      fontSize:      TILE.deltaSize,
      color,
      letterSpacing: LETTER_SPACING_WIDE,
      lineHeight:    'var(--leading-mono)',
      background:    `color-mix(in srgb, ${color} 10%, transparent)`,
      border:        `${HAIRLINE} solid color-mix(in srgb, ${color} 25%, transparent)`,
      borderRadius:  TILE.deltaRadiusPx,
      padding:       `${TILE.deltaPadV}px ${TILE.deltaPadH}px`,
      alignSelf:     'flex-start',
    }}>
      {sign}{delta}
    </span>
  )
}

// ── Count-up hook ─────────────────────────────────────────────────────────────

function useCountUp(target: number, durationMs: number): number {
  const [value, setValue] = useState(0)
  const frame = useRef(0)

  useEffect(() => {
    if (durationMs === 0) { setValue(target); return }
    if (target === 0) { setValue(0); return }
    const start = performance.now()
    function tick(now: number) {
      const t      = Math.min((now - start) / durationMs, 1)
      const eased  = 1 - Math.pow(1 - t, 3)   // ease-out cubic
      setValue(Math.round(target * eased))
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target, durationMs])

  return value
}
