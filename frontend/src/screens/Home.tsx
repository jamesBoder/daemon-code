import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CompileScreen } from '../components/daemon/CompileScreen'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { DaemonButton } from '../components/ui/DaemonButton'
import { BottomNav } from '../components/ui/BottomNav'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { apiFetchJson, homeToCompileData } from '../lib/api'
import { applyArchetypeAccent } from '../lib/colors'
import { BOTTOM_NAV_HEIGHT, HAIRLINE, LETTER_SPACING_PROCESS, LETTER_SPACING_WIDE, MODAL_Z_INDEX, MAX_CONTENT_WIDTH, MIN_TOUCH_TARGET, ORB_LAYOUT_ID, SCREEN_HEADER_HEIGHT, TOAST_DISMISS_MS } from '../lib/constants'
import { usePushPrompt } from '../hooks/usePushPrompt'
import { copy } from '../lib/copy'
import type { HomeData, ShadowProfile, Archetype, Process, ProcessState } from '../types'

const PLAYED_KEY = 'compile_played_day'

export function Home() {
  const navigate    = useNavigate()
  const audioRef    = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying]         = useState(false)
  const [audioError, setAudioError]   = useState(false)

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
    ? sessionStorage.getItem(PLAYED_KEY) !== String(home.day)
    : false

  useEffect(() => {
    if (home && autoPlay) {
      sessionStorage.setItem(PLAYED_KEY, String(home.day))
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
        <div className="glass-card" style={{ padding: 'var(--space-8)', maxWidth: 320, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
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
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)', textAlign: 'center', maxWidth: 280 }}>
            The daemon has a first impression.<br />It will know more tomorrow.
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

          {/* Navigation — below CompileScreen, not inside it */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-8)', maxWidth: MAX_CONTENT_WIDTH, margin: 'var(--space-8) auto 0' }}>
            <DaemonButton onClick={() => navigate('/session')}>
              Begin session →
            </DaemonButton>

            {processes.length > 0 && (
              <ProcessStrip processes={processes} onViewAll={() => navigate('/processes')} />
            )}
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

      {/* Inline error — auto-dismisses after TOAST_DISMISS_MS */}
      {audioError && (
        <div style={{
          position: 'fixed', bottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + var(--space-4))`,
          left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', border: `${HAIRLINE} solid var(--border)`,
          borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-5)',
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
          whiteSpace: 'nowrap', zIndex: 20,
        }}>
          Audio unavailable
        </div>
      )}

      {showPushPrompt && <PushPrompt onDismiss={dismissPush} onEnable={enablePush} />}
      <BottomNav />
    </>
  )
}

const STATE_COLORS: Record<ProcessState, string> = {
  running:   'var(--compile-green)',
  sleeping:  'var(--text-muted)',
  weakening: 'var(--warning)',
  new:       'var(--accent)',
}

const STRIP_MAX = 3  // process rows shown in the home strip

function ProcessStrip({ processes, onViewAll }: { processes: Process[]; onViewAll: () => void }) {
  const active = processes.filter(p => p.state === 'running' || p.state === 'new')
  const rest   = processes.filter(p => p.state !== 'running' && p.state !== 'new')
  const top    = [...active, ...rest].slice(0, STRIP_MAX)

  return (
    <div className="glass-card" style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
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
        const color = STATE_COLORS[p.state as ProcessState] ?? 'var(--text-muted)'
        return (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) 0' }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: p.unnamed ? 'var(--text-muted)' : 'var(--text-primary)',
              letterSpacing: LETTER_SPACING_PROCESS,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}>
              {name}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color, letterSpacing: LETTER_SPACING_PROCESS, flexShrink: 0 }}>
              {p.state}
            </span>
          </div>
        )
      })}
    </div>
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
