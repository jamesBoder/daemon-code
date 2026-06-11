import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CompileScreen } from '../components/daemon/CompileScreen'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { SignalWhisper } from '../components/daemon/SignalWhisper'
import { DaemonButton } from '../components/ui/DaemonButton'
import { BottomNav } from '../components/ui/BottomNav'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { ScoreTriad } from '../components/daemon/ScoreTriad'
import { apiFetchJson, getPulseToday, homeToCompileData } from '../lib/api'
import { PulseEntryCard } from '../components/pulse/PulseEntryCard'
import { ProcessStatus } from '../components/processlog/ProcessStatus'
import { applyArchetypeAccent } from '../lib/colors'
import { BOTTOM_NAV_HEIGHT, BUTTON_TAP_OPACITY, BUTTON_TAP_SCALE, COMPILE_PLAYED_KEY, DAY0_TEXT_MAX_W, HAIRLINE, LETTER_SPACING_PROCESS, LETTER_SPACING_WIDE, MODAL_MAX_WIDTH, MODAL_Z_INDEX, MAX_CONTENT_WIDTH, MIN_TOUCH_TARGET, ORB_LAYOUT_ID, ROUTE_TRANSITION_MS, SCREEN_HEADER_HEIGHT, TOAST_DISMISS_MS, TOAST_Z_INDEX } from '../lib/constants'
import { copy } from '../lib/copy'
import { generateAndShareCard } from '../lib/shareCard'
import { usePushPrompt } from '../hooks/usePushPrompt'
import type { HomeData, ShadowProfile, Archetype, Process, ProcessState } from '../types'


export function Home() {
  const navigate    = useNavigate()
  const audioRef    = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying]         = useState(false)
  const [audioError, setAudioError]   = useState(false)
  const [shareError, setShareError]   = useState(false)
  const [sharing, setSharing]         = useState(false)

  const { data: home, isLoading: homeLoading, isError: homeError, refetch } = useQuery({
    queryKey: ['home'],
    queryFn: () => apiFetchJson<HomeData>('/home'),
    staleTime: 23 * 60 * 60 * 1000,
  })

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiFetchJson<ShadowProfile>('/profile'),
    staleTime: 5 * 60 * 1000,
  })

  const { data: processes = [] } = useQuery({
    queryKey: ['processes'],
    queryFn: () => apiFetchJson<Process[]>('/processes'),
    staleTime: 5 * 60 * 1000,
    enabled: !!(home && home.processingSignals > 0),
  })

  const { data: pulse } = useQuery({
    queryKey: ['pulse'],
    queryFn: getPulseToday,
    staleTime: 0,
    enabled: !homeLoading,
  })

  // Apply archetype accent color whenever profile loads or archetype changes
  useEffect(() => {
    if (!profile) return
    const archetype = (profile.primary_archetype || 'default') as Archetype
    applyArchetypeAccent(archetype)
  }, [profile?.primary_archetype])

  const isLoading = homeLoading || profileLoading
  const isError   = homeError

  const { show: showPushPrompt, dismiss: dismissPush, enable: enablePush } = usePushPrompt(home?.day ?? 0)

  // Only play the animation once per day — sessionStorage resets on a new day
  const autoPlay = home
    ? sessionStorage.getItem(COMPILE_PLAYED_KEY) !== String(home.day)
    : false

  useEffect(() => {
    if (home && autoPlay) {
      sessionStorage.setItem(COMPILE_PLAYED_KEY, String(home.day))
    }
  }, [home?.day, autoPlay])

  function handleMicClick() {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play().then(() => {
        setPlaying(true)
      }).catch(() => {
        setAudioError(true)
        setTimeout(() => setAudioError(false), TOAST_DISMISS_MS)
      })
    }
  }

  async function handleShare() {
    if (sharing || !home) return
    setSharing(true)
    try {
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
      const namedProcesses = processes
        .filter(p => !p.unnamed && p.name)
        .slice(0, 3)
        .map(p => ({ name: p.name as string, state: p.state as ProcessState, strength: p.strength }))
      await generateAndShareCard({
        prose:               home.daemonProse,
        day:                 home.day,
        orbState:            home.orbState,
        processes:           namedProcesses,
        accent,
        kernelAccess:        home.kernelAccess,
        daemonAccuracy:      home.daemonAccuracy,
        decodedLines:        home.decodedLines,
        kernelAccessDelta:   home.kernelAccessDelta,
        daemonAccuracyDelta: home.daemonAccuracyDelta,
        decodedLinesDelta:   home.decodedLinesDelta,
        consecutiveDays:     home.consecutiveDays,
        signalQuote:         home.dailySignalQuote,
        signalAuthor:        home.dailySignalAuthor,
      })
    } catch (err) {
      // AbortError means the user cancelled the share sheet — not an error
      if (err instanceof Error && err.name !== 'AbortError') {
        setShareError(true)
        setTimeout(() => setShareError(false), TOAST_DISMISS_MS)
      }
    } finally {
      setSharing(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <DaemonOrb state="cold" />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (isError || !home) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-8)' }}>
        <div className="glass-card" style={{ padding: 'var(--space-8)', maxWidth: MODAL_MAX_WIDTH, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
            The daemon is unreachable. Try again later.
          </p>
          <DaemonButton onClick={() => refetch()}>Retry</DaemonButton>
        </div>
      </div>
    )
  }

  const compileData = homeToCompileData(home)

  // ── Day 0 — Analyst hasn't run yet, no compile data ──────────────────────
  // Show the orb as hero rather than the compile screen with all-zero stats.
  if (home.processingSignals === 0) {
    return (
      <>
        <ScreenHeader title="daemon" />
        <div style={{
          position: 'fixed', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 'var(--space-8)',
          padding: 'var(--space-8)',
          paddingTop: `calc(${SCREEN_HEADER_HEIGHT}px + env(safe-area-inset-top) + var(--space-4))`,
          paddingBottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
        }}>
          <DaemonOrb state="cold" size={240} layoutId={ORB_LAYOUT_ID} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE }}>
            Forming · Day {home.day}
          </p>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)', textAlign: 'center', maxWidth: DAY0_TEXT_MAX_W }}>
            I noted what you did during onboarding.<br />The analyst processes overnight.<br />The first model surfaces tomorrow.
          </p>
          <DaemonButton onClick={() => navigate('/session')}>
            Begin session →
          </DaemonButton>
        </div>
        {showPushPrompt && <PushPrompt onDismiss={dismissPush} onEnable={enablePush} />}
        <BottomNav />
      </>
    )
  }

  return (
    <>
      <ScreenHeader title="daemon" />
      {/* Scrollable content — BOTTOM_NAV_HEIGHT bottom pad clears BottomNav */}
      <div className="screen" style={{ overflowY: 'auto', paddingTop: `calc(${SCREEN_HEADER_HEIGHT}px + env(safe-area-inset-top))`, paddingBottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))` }}>
        <div style={{ padding: 'var(--space-5) var(--space-5) var(--space-8)' }}>
          <CompileScreen
            data={compileData}
            autoPlay={autoPlay}
            audioUrl={compileData.daemonAudioUrl}
            audioPlaying={playing}
            onMicClick={handleMicClick}
          />

          {/* Score triad — persistent three-number display */}
          <div style={{ maxWidth: MAX_CONTENT_WIDTH, margin: '0 auto', width: '100%' }}>
            <ScoreTriad
              kernelAccess={compileData.kernelAccess}
              daemonAccuracy={compileData.daemonAccuracy}
              decodedLines={compileData.decodedLines}
              kernelAccessDelta={compileData.kernelAccessDelta}
              daemonAccuracyDelta={compileData.daemonAccuracyDelta}
              decodedLinesDelta={compileData.decodedLinesDelta}
            />
            {/* Layer 1 — score whispers appear below the card on first non-zero load */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: 'var(--space-3)', pointerEvents: 'none' }}>
              <SignalWhisper hintKey="kernel_access"   text={copy.signalHints.kernel_access}   condition={compileData.kernelAccess > 0} />
              <SignalWhisper hintKey="daemon_accuracy" text={copy.signalHints.daemon_accuracy} condition={compileData.daemonAccuracy > 0} />
              <SignalWhisper hintKey="decoded_lines"   text={copy.signalHints.decoded_lines}   condition={compileData.decodedLines > 0} />
            </div>
          </div>

          {/* Navigation — below CompileScreen, not inside it */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: MAX_CONTENT_WIDTH, margin: 'var(--space-8) auto 0' }}>
            <DaemonButton onClick={() => navigate('/session')}>
              Begin session →
            </DaemonButton>

            {processes.length > 0 && (
              <ProcessStrip processes={processes} onViewAll={() => navigate('/processes')} />
            )}

            <PulseEntryCard visible={!!(pulse?.scenario && !pulse.completed)} />

            {/* Secondary actions — share + chronicle */}
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <SecondaryAction
                onClick={handleShare}
                disabled={sharing}
                style={{ opacity: sharing ? 0.5 : 1 }}
              >
                {sharing ? 'generating…' : 'Share today.'}
              </SecondaryAction>
              <SecondaryAction onClick={() => navigate('/chronicle')}>
                the chronicle →
              </SecondaryAction>
            </div>
          </div>
        </div>
      </div>

      {/* Audio — src is 24h presigned URL; rendered only when audio exists */}
      {compileData.daemonAudioUrl && (
        <audio
          ref={audioRef}
          src={compileData.daemonAudioUrl}
          onEnded={() => setPlaying(false)}
          style={{ display: 'none' }}
        />
      )}

      {/* Inline toasts — auto-dismiss after TOAST_DISMISS_MS */}
      {(audioError || shareError) && (
        <div style={{
          position: 'fixed', bottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + var(--space-4))`,
          left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', border: `${HAIRLINE} solid var(--border)`,
          borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-5)',
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
          whiteSpace: 'nowrap', zIndex: TOAST_Z_INDEX,
        }}>
          {audioError ? 'Audio unavailable' : 'Could not share'}
        </div>
      )}

      {showPushPrompt && <PushPrompt onDismiss={dismissPush} onEnable={enablePush} />}
      <BottomNav />
    </>
  )
}

const STRIP = {
  max:  3,  // process rows shown in the home strip
  barH: 2,  // px — strength bar height, mirrors ProcessEntry
} as const

function ProcessStrip({ processes, onViewAll }: { processes: Process[]; onViewAll: () => void }) {
  const active = processes.filter(p => p.state === 'running' || p.state === 'new')
  const rest   = processes.filter(p => p.state !== 'running' && p.state !== 'new')
  const top    = [...active, ...rest].slice(0, STRIP.max)

  return (
    <div className="glass-card" style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE }}>
          active processes
        </span>
        <button
          onClick={onViewAll}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE, padding: 0, minHeight: MIN_TOUCH_TARGET, display: 'flex', alignItems: 'center' }}
        >
          view all →
        </button>
      </div>
      {top.map((p, i) => {
        const name = p.name
          ? p.name
          : `unnamed_process_${String(i + 1).padStart(3, '0')}`
        return (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0, flex: 1 }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: p.unnamed ? 'var(--text-muted)' : 'var(--text-primary)',
                letterSpacing: LETTER_SPACING_PROCESS,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {name}
              </span>
              {p.unnamed ? (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', lineHeight: 'var(--leading-xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {copy.processLog.stillForming}
                </span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <div style={{ flex: 1, height: STRIP.barH, background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p.strength}%`, background: 'var(--accent)', borderRadius: 'var(--radius-full)', transition: 'width 0.6s ease' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_PROCESS, flexShrink: 0 }}>
                    {p.strength}%
                  </span>
                </div>
              )}
            </div>
            <ProcessStatus state={p.state as ProcessState} />
          </div>
        )
      })}
    </div>
  )
}

const SECONDARY_ACTION = {
  flex:          1,
  background:    'none',
  border:        `${HAIRLINE} solid var(--border)`,
  borderRadius:  'var(--radius-md)',
  padding:       'var(--space-3) var(--space-4)',
  fontFamily:    'var(--font-mono)',
  fontSize:      'var(--text-xs)',
  color:         'var(--text-muted)',
  letterSpacing: LETTER_SPACING_WIDE,
  minHeight:     MIN_TOUCH_TARGET,
  cursor:        'pointer',
  display:       'flex',
  alignItems:    'center',
  justifyContent:'center',
  transition:    `opacity ${ROUTE_TRANSITION_MS / 1000}s`,
} as const

function SecondaryAction({ onClick, disabled, style, children }: {
  onClick:   () => void
  disabled?: boolean
  style?:    CSSProperties
  children:  ReactNode
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: BUTTON_TAP_SCALE, opacity: BUTTON_TAP_OPACITY }}
      style={{ ...SECONDARY_ACTION, cursor: disabled ? 'default' : 'pointer', ...style }}
    >
      {children}
    </motion.button>
  )
}

function PushPrompt({ onDismiss, onEnable }: { onDismiss: () => void; onEnable: () => void }) {
  return (
    <>
      {/* Tap-outside-to-dismiss backdrop */}
      <div
        onClick={onDismiss}
        style={{ position: 'fixed', inset: 0, zIndex: MODAL_Z_INDEX - 1 }}
      />
      <div style={{
        position: 'fixed',
        bottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + var(--space-4))`,
        left: '50%',
        transform: 'translateX(-50%)',
        width: `min(calc(100vw - var(--space-8)), ${MAX_CONTENT_WIDTH}px)`,
        zIndex: MODAL_Z_INDEX,
      }}>
        <div className="glass-card" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-base)',
            lineHeight: 'var(--leading-base)',
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            {copy.push.prompt}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              onClick={onDismiss}
              style={{ flex: 1, background: 'none', border: `${HAIRLINE} solid var(--border)`, borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              {copy.push.dismissLabel}
            </button>
            <DaemonButton onClick={onEnable} style={{ flex: 1 }}>
              {copy.push.enableLabel}
            </DaemonButton>
          </div>
        </div>
      </div>
    </>
  )
}
