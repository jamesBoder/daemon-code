import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Portrait } from '../components/portrait/Portrait'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { SignalWhisper } from '../components/daemon/SignalWhisper'
import { BottomNav } from '../components/ui/BottomNav'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { fetchSelf } from '../lib/api'
import {
  BOTTOM_NAV_HEIGHT,
  BUTTON_TAP_OPACITY,
  BUTTON_TAP_SCALE,
  LETTER_SPACING_WIDE,
  MAX_CONTENT_WIDTH,
  MIN_TOUCH_TARGET,
  SCREEN_HEADER_HEIGHT,
} from '../lib/constants'
import { copy } from '../lib/copy'

const SELF = {
  portraitSize: 300, // px — square canvas edge (capped to viewport by Portrait)
  stateMaxW: 300, // px — copy column width for empty / read lines
  fadeS: 0.6, // s — portrait reveal
  linkLabelGap: 2, // px — between the two stacked labels in the Processes link
} as const

export function Self() {
  const navigate = useNavigate()

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['self'],
    queryFn: fetchSelf,
    staleTime: 5 * 60 * 1000,
  })

  // Guard against a null dimensions field (defensive — backend now sends {}).
  const hasRead = !!data && Object.keys(data.dimensions ?? {}).length > 0

  return (
    <>
      <ScreenHeader title={copy.self.title} />
      <div
        className="screen"
        style={{
          overflowY: 'auto',
          paddingTop: `calc(${SCREEN_HEADER_HEIGHT}px + env(safe-area-inset-top))`,
          paddingBottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
        }}
      >
        <div
          style={{
            padding: 'var(--space-6) var(--space-5) var(--space-8)',
            maxWidth: MAX_CONTENT_WIDTH,
            margin: '0 auto',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 'var(--space-16)', gap: 'var(--space-4)' }}>
              <DaemonOrb state="cold" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE }}>
                reading
              </span>
            </div>
          ) : isError || !data ? (
            <div style={{ paddingTop: 'var(--space-16)', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-muted)', maxWidth: SELF.stateMaxW, margin: '0 auto' }}>
                Could not load your read.<br />
                Check your connection and try again.
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
          ) : !hasRead ? (
            <div style={{ paddingTop: 'var(--space-12)', textAlign: 'center' }}>
              <DaemonOrb state="cold" />
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)', maxWidth: SELF.stateMaxW, margin: 'var(--space-6) auto 0' }}>
                {copy.self.emptyTitle}<br />
                <span style={{ color: 'var(--text-muted)' }}>{copy.self.emptyBody}</span>
              </p>
            </div>
          ) : (
            <>
              <SignalWhisper
                hintKey="self_first"
                text={copy.signalHints.self_first}
                condition={hasRead}
              />

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: SELF.fadeS }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-5)', paddingTop: 'var(--space-4)' }}
              >
                <Portrait read={data} size={SELF.portraitSize} />

                {/* Archetype, surfaced richly */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE, textTransform: 'uppercase' }}>
                    {copy.self.archetypeIntro}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--accent)', marginTop: 'var(--space-2)' }}>
                    {copy.self.archetypeNames[data.archetype] ?? copy.self.archetypeNames.default}
                  </div>
                </div>

                {/* The relationship stage, made legible */}
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', lineHeight: 'var(--leading-lg)', color: 'var(--text-secondary)', maxWidth: SELF.stateMaxW, textAlign: 'center', margin: 0 }}>
                  {copy.self.stageLines[data.stage] ?? copy.self.stageLines.cold}
                </p>

                {/* Down to the Process Log — the Self tab absorbs it */}
                <motion.button
                  onClick={() => navigate('/processes')}
                  whileTap={{ scale: BUTTON_TAP_SCALE, opacity: BUTTON_TAP_OPACITY }}
                  style={{ background: 'none', border: '1px solid var(--border-active)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SELF.linkLabelGap, marginTop: 'var(--space-2)', minHeight: MIN_TOUCH_TARGET, padding: 'var(--space-3) var(--space-6)' }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', letterSpacing: LETTER_SPACING_WIDE }}>
                    {copy.self.processesLink}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {copy.self.processesHint}
                  </span>
                </motion.button>
              </motion.div>
            </>
          )}
        </div>
      </div>

      <BottomNav />
    </>
  )
}
