import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { SignalWhisper } from '../components/daemon/SignalWhisper'
import { BottomNav } from '../components/ui/BottomNav'
import { PlayPauseIcon } from '../components/ui/PlayPauseIcon'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { apiFetchJson } from '../lib/api'
import { BOTTOM_NAV_HEIGHT, BUTTON_TAP_OPACITY, BUTTON_TAP_SCALE, HAIRLINE, LETTER_SPACING_TIGHT, LETTER_SPACING_WIDE, MAX_CONTENT_WIDTH, MIN_TOUCH_TARGET, PROSE_MAX_WIDTH, SCREEN_HEADER_HEIGHT, TOAST_DISMISS_MS, TOAST_Z_INDEX } from '../lib/constants'
import { copy } from '../lib/copy'
import { formatDateLong } from '../lib/dates'
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

export function Chronicle() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playingDate, setPlayingDate] = useState<string | null>(null)
  const [audioError, setAudioError]   = useState(false)

  const { data: entries = [], isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['chronicle'],
    queryFn: () => apiFetchJson<ChronicleEntry[]>('/chronicle'),
    staleTime: Infinity,
  })

  // One shared audio element — starting an entry stops whichever was playing
  function handlePlayClick(entry: ChronicleEntry) {
    const audio = audioRef.current
    if (!audio || !entry.audioUrl) return
    if (playingDate === entry.date) {
      audio.pause()
      setPlayingDate(null)
      return
    }
    audio.src = entry.audioUrl
    audio.play().then(() => {
      setPlayingDate(entry.date)
    }).catch(() => {
      setPlayingDate(null)
      setAudioError(true)
      setTimeout(() => setAudioError(false), TOAST_DISMISS_MS)
    })
  }

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
                <ChronicleCard
                  key={entry.date}
                  entry={entry}
                  index={i}
                  playing={playingDate === entry.date}
                  onPlayClick={handlePlayClick}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Audio — src is set per entry on play; rendered once for the screen */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingDate(null)}
        style={{ display: 'none' }}
      />

      {/* Inline toast — auto-dismisses after TOAST_DISMISS_MS */}
      {audioError && (
        <div style={{
          position: 'fixed', bottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + var(--space-4))`,
          left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', border: `${HAIRLINE} solid var(--border)`,
          borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-5)',
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
          whiteSpace: 'nowrap', zIndex: TOAST_Z_INDEX,
        }}>
          Audio unavailable
        </div>
      )}

      <BottomNav />
    </>
  )
}

// pad expands the tap target to 14+30=44px; negative margin keeps the header row compact
const AUDIO_BTN = { iconSize: 14, pad: 15 } as const

function ChronicleCard({ entry, index, playing, onPlayClick }: {
  entry: ChronicleEntry
  index: number
  playing: boolean
  onPlayClick: (entry: ChronicleEntry) => void
}) {
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
          {formatDateLong(entry.date)}
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
          {entry.audioUrl && (
            <button
              type="button"
              onClick={() => onPlayClick(entry)}
              aria-label={playing ? 'Stop daemon voice' : 'Listen to daemon voice'}
              style={{
                padding: AUDIO_BTN.pad,
                margin: -AUDIO_BTN.pad,
                marginLeft: 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: playing ? 'var(--accent)' : 'var(--text-muted)',
                lineHeight: 1,
                transition: 'color 0.2s',
              }}
            >
              <PlayPauseIcon playing={playing} size={AUDIO_BTN.iconSize} />
            </button>
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
