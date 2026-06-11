import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { SignalWhisper } from '../components/daemon/SignalWhisper'
import { BottomNav } from '../components/ui/BottomNav'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { apiFetchJson } from '../lib/api'
import { BOTTOM_NAV_HEIGHT, BUTTON_TAP_OPACITY, BUTTON_TAP_SCALE, HAIRLINE, LETTER_SPACING_TIGHT, LETTER_SPACING_WIDE, MAX_CONTENT_WIDTH, MIN_TOUCH_TARGET, PROSE_MAX_WIDTH, SCREEN_HEADER_HEIGHT } from '../lib/constants'
import { copy } from '../lib/copy'
import { useReducedMotion } from '../hooks/useReducedMotion'
import type { ChronicleEntry, OrbState } from '../types'

const ANIM = {
  cardDurationS:  0.3,
  staggerS:       0.04,
  staggerMaxIdx:  6,  // entries beyond this index appear without additional delay
  slideUpY:       8,  // px — initial y offset for card entrance
} as const

// Color per orb stage — reflects daemon's knowledge depth at that point in time
const STAGE_COLORS: Record<OrbState, string> = {
  cold:    'var(--text-secondary)',
  warming: 'var(--warning)',
  running: 'var(--compile-green)',
  deep:    'var(--text-daemon)',
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  const d = new Date(Number(year), Number(month) - 1, Number(day))
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

export function Chronicle() {
  const { data: entries = [], isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['chronicle'],
    queryFn: () => apiFetchJson<ChronicleEntry[]>('/chronicle'),
    staleTime: Infinity,
  })

  return (
    <>
      <ScreenHeader title="the chronicle" />
      <div className="screen" style={{ overflowY: 'auto', paddingTop: `calc(${SCREEN_HEADER_HEIGHT}px + env(safe-area-inset-top))`, paddingBottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))` }}>
        <div style={{ padding: 'var(--space-6) var(--space-5) var(--space-8)', maxWidth: MAX_CONTENT_WIDTH, margin: '0 auto', width: '100%' }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 'var(--space-16)', gap: 'var(--space-4)' }}>
              <DaemonOrb state="cold" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE }}>
                loading
              </span>
            </div>
          ) : isError ? (
            <div style={{ paddingTop: 'var(--space-16)', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-muted)', maxWidth: PROSE_MAX_WIDTH, margin: '0 auto' }}>
                Could not load the chronicle.<br />Check your connection and try again.
              </p>
              <motion.button
                onClick={() => refetch()}
                disabled={isFetching}
                whileTap={isFetching ? {} : { scale: BUTTON_TAP_SCALE, opacity: BUTTON_TAP_OPACITY }}
                style={{ background: 'none', border: 'none', cursor: isFetching ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE, marginTop: 'var(--space-4)', minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, padding: 'var(--space-3) var(--space-4)', opacity: isFetching ? 0.4 : 1 }}
              >
                {isFetching ? '···' : 'retry'}
              </motion.button>
            </div>
          ) : entries.length === 0 ? (
            <div style={{ paddingTop: 'var(--space-16)', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)', maxWidth: PROSE_MAX_WIDTH, margin: '0 auto' }}>
                The daemon has not written yet.
              </p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-4)', letterSpacing: LETTER_SPACING_WIDE }}>
                The chronicle begins after the first overnight compile.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <SignalWhisper
                hintKey="chronicle_first"
                text={copy.signalHints.chronicle_first}
                condition={entries.length > 0}
              />
              {entries.map((entry, i) => (
                <ChronicleCard key={entry.date} entry={entry} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </>
  )
}

function ChronicleCard({ entry, index }: { entry: ChronicleEntry; index: number }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : ANIM.slideUpY }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : ANIM.cardDurationS, delay: reduced ? 0 : Math.min(index, ANIM.staggerMaxIdx) * ANIM.staggerS, ease: 'easeOut' }}
      className="glass-card"
      style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
    >
      {/* Date + day + stage */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE }}>
          {formatDate(entry.date)}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {entry.day > 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE }}>
              day {entry.day}
            </span>
          )}
          {entry.orbState && (
            <>
              {entry.day > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--border-active)' }}>·</span>}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: STAGE_COLORS[entry.orbState], letterSpacing: LETTER_SPACING_WIDE }}>
                {entry.orbState}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Prose */}
      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'var(--text-lg)',
        lineHeight: 'var(--leading-xl)',
        fontWeight: 300,
        color: 'var(--text-daemon)',
        letterSpacing: LETTER_SPACING_TIGHT,
        margin: 0,
      }}>
        {entry.prose}
      </p>

      {/* Shadow prompt */}
      {entry.shadowPrompt && (
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-sm)',
          lineHeight: 'var(--leading-sm)',
          fontWeight: 300,
          color: 'var(--text-muted)',
          fontStyle: 'italic',
          letterSpacing: LETTER_SPACING_TIGHT,
          margin: 0,
          paddingTop: 'var(--space-2)',
          borderTop: `${HAIRLINE} solid var(--border)`,
        }}>
          {entry.shadowPrompt}
        </p>
      )}

      {/* Daily signal */}
      {entry.signalQuote && (
        <div style={{ paddingTop: 'var(--space-2)', borderTop: `${HAIRLINE} solid var(--border-subtle)` }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-sm)',
            lineHeight: 'var(--leading-sm)',
            fontWeight: 300,
            color: 'var(--text-muted)',
            fontStyle: 'italic',
            letterSpacing: LETTER_SPACING_TIGHT,
            margin: 0,
          }}>
            &#x201C;{entry.signalQuote}&#x201D;
          </p>
          {entry.signalAuthor && (
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              letterSpacing: LETTER_SPACING_WIDE,
              margin: 'var(--space-1) 0 0',
            }}>
              — {entry.signalAuthor}
            </p>
          )}
        </div>
      )}
    </motion.div>
  )
}
