import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ConsoleShell } from '../../components/console/ConsoleShell'
import { DaemonOrb } from '../../components/daemon/DaemonOrb'
import { DaemonButton } from '../../components/ui/DaemonButton'
import { apiFetchJson } from '../../lib/api'
import { DAY_QUERY_STALE_MS } from '../../lib/constants'
import type { HomeData, SessionTodayResponse } from '../../types'

// PLAY's idle state — the "console readout" (docs/simplify-pass.md), absorbing
// Home's daily-entry function without its density of daemon-mystique framing.
// The "playing" and "complete" states deliberately reuse the existing
// Session.tsx / SessionComplete.tsx screens unchanged (both are already
// full-bleed, chrome-free, which is exactly what "chrome hidden during
// gameplay" needs) rather than duplicating ~250 lines of game/completion
// logic — see the returnTo threading in Session.tsx and SessionComplete.tsx.
export function Play() {
  const navigate = useNavigate()

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

  function begin() {
    navigate('/session', { state: { returnTo: '/play' } })
  }

  return (
    <ConsoleShell active="play">
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
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--text-muted)' }}>
            reading...
          </p>
        )}

        {!isLoading && !ready && (
          <p
            style={{
              fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
              lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)',
              textAlign: 'center', maxWidth: 280,
            }}
          >
            The daemon is still processing.<br />
            Today&rsquo;s session isn&rsquo;t ready yet.
          </p>
        )}

        {!isLoading && ready && (
          <>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--text-muted)' }}>
              day {home?.day ?? '—'}
            </p>
            <DaemonButton onClick={begin}>Begin</DaemonButton>
          </>
        )}
      </div>
    </ConsoleShell>
  )
}
