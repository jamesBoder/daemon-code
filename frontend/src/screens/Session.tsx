import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SessionContainer } from '../components/minigames/SessionContainer'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { DaemonButton } from '../components/ui/DaemonButton'
import { apiFetchJson, postSessionComplete } from '../lib/api'
import { DAY_QUERY_STALE_MS, ORB_LAYOUT_ID, SESSION_NOT_READY_POLL_MS } from '../lib/constants'
import type { SessionTodayResponse } from '../types'

export function Session() {
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const location      = useLocation()
  // Set when entered from the new PLAY console (docs/simplify-pass.md) so
  // completion returns there instead of the old /home default. Absent for
  // every existing entry point (BottomNav's Session tab) — behavior for
  // that path is unchanged.
  const returnTo      = (location.state as { returnTo?: string } | null)?.returnTo

  const { data, isLoading } = useQuery({
    queryKey: ['session-today'],
    queryFn: () => apiFetchJson<SessionTodayResponse>('/session/today'),
    // A ready deck holds all day; "not ready" must stay stale so the screen
    // re-asks the server once the overnight deck lands instead of caching
    // this morning's miss for 23 hours.
    staleTime: query => (query.state.data?.ready ? DAY_QUERY_STALE_MS : 0),
    // On-demand generation now runs asynchronously (see Play.tsx) -- poll
    // while not ready so this fallback screen picks up the deck once it
    // lands, instead of requiring a manual reload.
    refetchInterval: query => (query.state.data?.ready ? false : SESSION_NOT_READY_POLL_MS),
  })

  async function handleComplete(fragmentCount: number) {
    queryClient.invalidateQueries({ queryKey: ['session-today'] })

    // Run the cheap deterministic scorer: real process movement + an immediate
    // daemon line, no AI. Best-effort — a failure must never block the completion
    // screen, so fall through to navigate either way.
    let daemonLine: string | undefined
    try {
      const live = await postSessionComplete()
      daemonLine = live.daemonLine
      // The Self tab folds the patterns in — refetch so it reflects tonight's moves.
      queryClient.invalidateQueries({ queryKey: ['processes'] })
    } catch {
      // Live scoring is non-essential; ignore and continue.
    }

    navigate('/session/complete', { state: { fragmentCount, daemonLine, returnTo } })
  }

  if (isLoading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <DaemonOrb state="cold" layoutId={ORB_LAYOUT_ID} />
      </div>
    )
  }

  if (!data?.ready || !data?.fragments?.length) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-8)', padding: 'var(--space-8)' }}>
        <DaemonOrb state="cold" />
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)', textAlign: 'center', maxWidth: 280 }}>
          The daemon is still processing.<br />
          Today&rsquo;s session isn&rsquo;t ready yet.
        </p>
        <DaemonButton onClick={() => navigate(returnTo ?? '/home')}>Return home →</DaemonButton>
      </div>
    )
  }

  return <SessionContainer fragments={data.fragments} onComplete={handleComplete} returnTo={returnTo} />
}
