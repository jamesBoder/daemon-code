import { motion } from 'framer-motion'
import { ProcessEntry } from './ProcessEntry'
import { PROCESS_STATE_COLORS } from './ProcessStatus'
import { copy } from '../../lib/copy'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { HAIRLINE, LETTER_SPACING_WIDE } from '../../lib/constants'
import type { ProcessEntryData, ProcessState } from '../../types'

const LIST = {
  distBarH:      3,     // px — state distribution bar height
  distBarGap:    2,     // px — gap between distribution bar segments
  dotSize:       6,     // px — state dot diameter in legend and section headers
  entranceS:     0.3,   // s — entry entrance duration
  staggerS:      0.04,  // s — entrance delay between consecutive entries
  staggerMaxIdx: 6,     // entries beyond this index appear without additional delay
  slideUpY:      8,     // px — initial y offset for entry entrance
} as const

// Display order: most alive first
const STATE_ORDER: ProcessState[] = ['running', 'new', 'weakening', 'sleeping']

interface ProcessListProps {
  entries: ProcessEntryData[]
  justMoved?: Record<string, number>  // process id → strength delta moved this session
}

export function ProcessList({ entries, justMoved }: ProcessListProps) {
  const reduced = useReducedMotion()

  const groups = STATE_ORDER
    .map(state => ({
      state,
      items: entries
        .filter(e => e.state === state)
        .sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name)),
    }))
    .filter(g => g.items.length > 0)

  const formingCount = entries.filter(e => e.unnamed).length
  let entryIndex = 0  // stagger index, continuous across sections

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Overview — what the daemon is tracking and how it splits across states */}
      <div className="glass-card" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-base)',
          lineHeight: 'var(--leading-base)',
          fontWeight: 300,
          color: 'var(--text-secondary)',
          margin: 0,
        }}>
          {copy.processLog.description}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* Distribution bar — one segment per state, width proportional to count */}
          <div
            role="img"
            aria-label={groups.map(g => `${g.items.length} ${g.state}`).join(', ')}
            style={{ display: 'flex', gap: LIST.distBarGap, height: LIST.distBarH, borderRadius: 'var(--radius-full)', overflow: 'hidden' }}
          >
            {groups.map(g => (
              <div key={g.state} style={{
                flex: g.items.length,
                background: PROCESS_STATE_COLORS[g.state],
                borderRadius: 'var(--radius-full)',
              }} />
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2) var(--space-4)', alignItems: 'center' }}>
            {groups.map(g => (
              <span key={g.state} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <StateDot color={PROCESS_STATE_COLORS[g.state]} />
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  letterSpacing: LETTER_SPACING_WIDE,
                }}>
                  {g.items.length} {g.state}
                </span>
              </span>
            ))}
            {formingCount > 0 && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                letterSpacing: LETTER_SPACING_WIDE,
                fontStyle: 'italic',
              }}>
                {formingCount} {copy.processLog.stillForming}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sections grouped by state */}
      {groups.map(group => (
        <section key={group.state}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            paddingBottom: 'var(--space-2)',
            marginBottom: 'var(--space-3)',
            borderBottom: `${HAIRLINE} solid var(--border-subtle)`,
          }}>
            <StateDot color={PROCESS_STATE_COLORS[group.state]} />
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: PROCESS_STATE_COLORS[group.state],
              letterSpacing: LETTER_SPACING_WIDE,
            }}>
              {group.state}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              letterSpacing: LETTER_SPACING_WIDE,
            }}>
              {group.items.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {group.items.map(entry => {
              const i = entryIndex++
              return (
                <motion.div
                  key={entry.id}
                  layout={reduced ? false : 'position'}
                  initial={{ opacity: 0, y: reduced ? 0 : LIST.slideUpY }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: reduced ? 0 : LIST.entranceS,
                    delay: reduced ? 0 : Math.min(i, LIST.staggerMaxIdx) * LIST.staggerS,
                    ease: 'easeOut',
                  }}
                >
                  <ProcessEntry entry={entry} justMovedDelta={justMoved?.[entry.id]} />
                </motion.div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function StateDot({ color }: { color: string }) {
  return (
    <span style={{
      width: LIST.dotSize,
      height: LIST.dotSize,
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
    }} />
  )
}
