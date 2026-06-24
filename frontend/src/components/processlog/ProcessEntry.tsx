import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PROCESS_STATE_COLORS } from './ProcessStatus'
import { springs } from '../../lib/springs'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { copy } from '../../lib/copy'
import { daysSince, formatDateLong, isToday } from '../../lib/dates'
import { DELTA_FLOAT_MS, DELTA_FLOAT_RISE, HAIRLINE, REDUCED_MOTION_DURATION, STIR_GLOW_BLUR, STIR_SWEEP_MS } from '../../lib/constants'
import type { ProcessEntryData } from '../../types'

const ENTRY = {
  strengthBarH:    2,    // px — process strength progress bar height
  chipPadV:        2,    // px — vertical padding on compile-change chip
  chevronSize:     10,   // px — expand affordance chevron
  barTransitionS:  0.6,  // s — strength bar width fill
  chevTransitionS: 0.2,  // s — chevron rotation on expand/collapse
  dotSize:         5,    // px — "stirred today" live-activity marker
  dotPulseS:       1.8,  // s — marker pulse period (motion only)
  dotPulseMinOpa:  0.35, // marker opacity trough during the pulse
  sweepOpa:        0.75, // just-moved bar sweep opacity
  deltaFloatTop:   -16,  // px — "+N" float vertical offset above the bar row
} as const

interface ProcessEntryProps {
  entry: ProcessEntryData
  unnamedMessage?: string
  justMovedDelta?: number  // strength gained this session; drives the one-time sweep + "+N" float
}

// Chip shown when this process moved in the latest compile.
// 'new' is omitted — the entry already sits under the "new" section header.
function diffChip(entry: ProcessEntryData): { text: string; color: string } | null {
  switch (entry.diffChange) {
    case 'strength_up':
      return { text: `↑${entry.diffDelta !== undefined ? Math.abs(entry.diffDelta) : ''}`, color: 'var(--compile-green)' }
    case 'strength_down':
      return { text: `↓${entry.diffDelta !== undefined ? Math.abs(entry.diffDelta) : ''}`, color: 'var(--warning)' }
    case 'named':
      return { text: copy.processLog.chipNamed, color: 'var(--accent)' }
    default:
      return null
  }
}

export function ProcessEntry({ entry, unnamedMessage = copy.processLog.unnamedExpanded, justMovedDelta }: ProcessEntryProps) {
  const [expanded, setExpanded] = useState(false)
  const reduced = useReducedMotion()

  const { name, state, strength, unnamed, firstDetected, lastSeen, daemonNote } = entry
  const stateColor = PROCESS_STATE_COLORS[state]
  const chip = diffChip(entry)
  const watchedDays = firstDetected ? daysSince(firstDetected) : 0
  // A named process touched in today's session — the live-movement marker.
  const stirredToday = !unnamed && !!lastSeen && isToday(lastSeen)
  // A positive move this very session drives the one-time sweep + "+N" float.
  const movedNow = !unnamed && justMovedDelta !== undefined && justMovedDelta > 0

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={() => setExpanded(e => !e)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setExpanded(ex => !ex)
        }
      }}
      className="glass-card"
      style={{
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Collapsed row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 'var(--space-4) var(--space-5)',
        gap: 'var(--space-4)',
      }}>
        {/* Left: name + bar (or "still forming") */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0, flex: 1 }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-mono)',
            lineHeight: 'var(--leading-mono)',
            color: unnamed ? 'var(--text-muted)' : 'var(--text-secondary)',
            letterSpacing: '0.02em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {name}
          </span>

          {unnamed ? (
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-xs)',
              lineHeight: 'var(--leading-xs)',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}>
              {copy.processLog.stillForming}
            </span>
          ) : (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {/* Ephemeral "+N" — this process moved this very session. */}
              {movedNow && (
                <motion.span
                  aria-hidden="true"
                  initial={{ opacity: 0, y: 0 }}
                  animate={{ opacity: [0, 1, 1, 0], y: reduced ? 0 : -DELTA_FLOAT_RISE }}
                  transition={{ duration: DELTA_FLOAT_MS / 1000, ease: 'easeOut', times: [0, 0.15, 0.55, 1] }}
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: ENTRY.deltaFloatTop,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-mono)',
                    color: 'var(--compile-green)',
                    letterSpacing: '0.02em',
                    pointerEvents: 'none',
                  }}
                >
                  +{justMovedDelta}
                </motion.span>
              )}

              <div style={{
                position: 'relative',
                flex: 1,
                height: ENTRY.strengthBarH,
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 'var(--radius-full)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${strength}%`,
                  background: stateColor,
                  borderRadius: 'var(--radius-full)',
                  transition: `width ${ENTRY.barTransitionS}s ease`,
                  // Steady glow while the process is active today — visible under reduced motion.
                  boxShadow: stirredToday ? `0 0 ${STIR_GLOW_BLUR}px ${stateColor}` : 'none',
                }} />
                {/* One-shot scan-line sweep across a just-moved bar (motion only). */}
                {movedNow && !reduced && (
                  <motion.div
                    aria-hidden="true"
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ duration: STIR_SWEEP_MS / 1000, ease: 'easeInOut' }}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: `linear-gradient(90deg, transparent, ${stateColor}, transparent)`,
                      opacity: ENTRY.sweepOpa,
                    }}
                  />
                )}
              </div>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-mono)',
                lineHeight: 'var(--leading-mono)',
                color: 'var(--text-muted)',
                letterSpacing: '0.02em',
                flexShrink: 0,
              }}>
                {strength}%
              </span>
            </div>
          )}
        </div>

        {/* Right: live "stirred today" marker + latest-compile change chip + expand affordance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
          {stirredToday && (
            <motion.span
              aria-label={copy.processLog.stirredToday}
              title={copy.processLog.stirredToday}
              animate={reduced ? undefined : { opacity: [1, ENTRY.dotPulseMinOpa, 1] }}
              transition={reduced ? undefined : { duration: ENTRY.dotPulseS, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                width: ENTRY.dotSize,
                height: ENTRY.dotSize,
                borderRadius: 'var(--radius-full)',
                background: stateColor,
                flexShrink: 0,
              }}
            />
          )}
          {chip && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-mono)',
              lineHeight: 'var(--leading-mono)',
              color: chip.color,
              letterSpacing: '0.05em',
              padding: `${ENTRY.chipPadV}px var(--space-2)`,
              borderRadius: 'var(--radius-full)',
              border: `${HAIRLINE} solid ${chip.color}`,
              background: `color-mix(in srgb, ${chip.color} 10%, transparent)`,
            }}>
              {chip.text}
            </span>
          )}
          <svg
            width={ENTRY.chevronSize}
            height={ENTRY.chevronSize}
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
            style={{
              color: 'var(--text-muted)',
              transform: expanded ? 'rotate(90deg)' : 'none',
              transition: `transform ${ENTRY.chevTransitionS}s ease`,
            }}
          >
            <path d="M3.5 1.5 L7 5 L3.5 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduced
              ? { duration: REDUCED_MOTION_DURATION }
              : { ...springs.slow, opacity: { duration: 0.2 } }
            }
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: 'var(--space-3) var(--space-5) var(--space-4)',
              borderTop: `${HAIRLINE} solid var(--border-subtle)`,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}>
              {firstDetected && (
                <>
                  <DetailRow label="first detected" value={formatDateLong(firstDetected)} />
                  <DetailRow label="watching for" value={`${watchedDays} ${watchedDays === 1 ? 'day' : 'days'}`} />
                </>
              )}
              {unnamed ? (
                <p style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 'var(--leading-sm)',
                  fontStyle: 'italic',
                  color: 'var(--text-muted)',
                }}>
                  {unnamedMessage}
                </p>
              ) : (
                <>
                  {lastSeen && (state === 'sleeping' || state === 'weakening') && (
                    <DetailRow label="last seen" value={formatDateLong(lastSeen)} />
                  )}
                  {copy.processLog.stateDescriptions[state] && (
                    <p style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--text-xs)',
                      lineHeight: 'var(--leading-xs)',
                      fontStyle: 'italic',
                      color: 'var(--text-muted)',
                    }}>
                      {copy.processLog.stateDescriptions[state]}
                    </p>
                  )}
                  {daemonNote && (
                    <p style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--text-sm)',
                      lineHeight: 'var(--leading-sm)',
                      fontStyle: 'italic',
                      color: 'var(--text-daemon)',
                    }}>
                      {daemonNote}
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        lineHeight: 'var(--leading-xs)',
        color: 'var(--text-muted)',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-mono)',
        lineHeight: 'var(--leading-mono)',
        color: 'var(--text-secondary)',
      }}>
        {value}
      </span>
    </div>
  )
}
