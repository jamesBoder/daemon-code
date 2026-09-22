import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ConsoleShell } from '../../components/console/ConsoleShell'
import { DaemonOrb } from '../../components/daemon/DaemonOrb'
import { DaemonButton } from '../../components/ui/DaemonButton'
import { apiFetchJson } from '../../lib/api'
import { playSound } from '../../lib/sound'
import { CONSOLE } from '../../lib/console'
import { generateAndShareCard } from '../../lib/shareCard'
import { DAY_QUERY_STALE_MS, TOAST_DISMISS_MS } from '../../lib/constants'
import type { HomeData, SessionTodayResponse } from '../../types'

// PLAY's idle state — the "console readout" (docs/simplify-pass.md), absorbing
// Home's daily-entry function. Copy is written fresh for this — a terse
// status readout, not narrative daemon-voice prose (real feedback,
// 2026-09-18: the first version reused Home's old "the daemon is still
// processing" line verbatim and read as no different from the old app).
// The "playing" and "complete" states deliberately reuse the existing
// Session.tsx / SessionComplete.tsx screens unchanged (both are already
// full-bleed, chrome-free, which is exactly what "chrome hidden during
// gameplay" needs) rather than duplicating ~250 lines of game/completion
// logic — see the returnTo threading in Session.tsx and SessionComplete.tsx.
export function Play() {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState(false)

  const { data: home, isLoading: homeLoading } = useQuery({
    queryKey: ['home'],
    queryFn: () => apiFetchJson<HomeData>('/home'),
    staleTime: query => (query.state.data?.daemonProse ? DAY_QUERY_STALE_MS : 0),
  })
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session-today'],
    queryFn: () => apiFetchJson<SessionTodayResponse>('/session/today'),
    staleTime: query => (query.state.data?.ready ? DAY_QUERY_STALE_MS : 0),
  })

  const isLoading = homeLoading || sessionLoading
  const ready = session?.ready && (session?.fragments?.length ?? 0) > 0

  // Leaving the console to play is a deliberate device action, not a plain
  // page jump — same flicker+click beat as a tab switch, so entering a
  // session feels continuous with the shell rather than dropping out of it.
  function begin() {
    playSound('click')
    setLeaving(true)
    window.setTimeout(() => {
      navigate('/session', { state: { returnTo: '/play' } })
    }, CONSOLE.tabSwitch.flickerMs)
  }

  // The share card (ported from Home.tsx, which PLAY absorbed) now quotes the
  // Narrator's short takeaway instead of excerpting a sentence out of the full
  // prose — falls back to the prose for entries generated before takeaway existed.
  const shareText = home?.takeaway || home?.daemonProse

  async function share() {
    if (sharing || !home || !shareText) return
    setSharing(true)
    try {
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
      await generateAndShareCard({
        prose:               shareText,
        day:                 home.day,
        orbState:            home.orbState,
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

  return (
    <ConsoleShell active="play" flickering={leaving}>
      <div
        style={{
          minHeight: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 'var(--space-6)', padding: 'var(--space-8)',
        }}
      >
        <DaemonOrb state={isLoading ? 'cold' : home?.orbState} kernelAccess={home?.kernelAccess} />

        {isLoading && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            reading
          </p>
        )}

        {!isLoading && !ready && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            standby — not ready yet
          </p>
        )}

        {!isLoading && ready && (
          <>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              day {home?.day ?? '—'} — ready
            </p>
            <DaemonButton onClick={begin} glow>Begin</DaemonButton>
          </>
        )}

        {!isLoading && shareText && (
          <DaemonButton variant="secondary" onClick={share} disabled={sharing}>
            {sharing ? 'generating…' : shareError ? 'could not share' : 'Share today'}
          </DaemonButton>
        )}
      </div>
    </ConsoleShell>
  )
}
