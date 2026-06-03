import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CompileScreen } from '../components/daemon/CompileScreen'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { DaemonButton } from '../components/ui/DaemonButton'
import { BottomNav } from '../components/ui/BottomNav'
import { apiFetchJson, homeToCompileData } from '../lib/api'
import { applyArchetypeAccent } from '../lib/colors'
import type { HomeData, ShadowProfile, Archetype } from '../types'

const PLAYED_KEY = 'compile_played_day'

export function Home() {
  const navigate = useNavigate()
  const audioRef = useRef<HTMLAudioElement>(null)

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

  // Apply archetype accent color whenever profile loads or archetype changes
  useEffect(() => {
    if (!profile) return
    const archetype = (profile.primary_archetype || 'default') as Archetype
    applyArchetypeAccent(archetype)
  }, [profile?.primary_archetype])

  const isLoading = homeLoading || profileLoading
  const isError   = homeError

  // Only play the animation once per day — sessionStorage resets on a new day
  const autoPlay = home
    ? sessionStorage.getItem(PLAYED_KEY) !== String(home.day)
    : false

  useEffect(() => {
    if (home && autoPlay) {
      sessionStorage.setItem(PLAYED_KEY, String(home.day))
    }
  }, [home?.day, autoPlay])

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

  return (
    <>
      {/* Scrollable content — 80px bottom pad clears BottomNav */}
      <div className="screen" style={{ overflowY: 'auto', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        <div style={{ padding: 'var(--space-10) var(--space-5) var(--space-8)' }}>
          <CompileScreen data={compileData} autoPlay={autoPlay} />

          {/* Navigation — below CompileScreen, not inside it */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-8)', maxWidth: 480, margin: 'var(--space-8) auto 0' }}>
            <DaemonButton onClick={() => navigate('/session')}>
              Begin session →
            </DaemonButton>
            <button
              onClick={() => navigate('/processes')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-2)' }}
            >
              View Process Log
            </button>
          </div>
        </div>
      </div>

      {/* Audio — hidden, controlled by DaemonProse mic click (Phase 4) */}
      {compileData.daemonAudioUrl && (
        <audio
          ref={audioRef}
          src={compileData.daemonAudioUrl}
          onEnded={() => {}}
          style={{ display: 'none' }}
        />
      )}

      <BottomNav />
    </>
  )
}
