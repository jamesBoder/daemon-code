import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SessionContainer } from '../components/minigames/SessionContainer'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { DaemonButton } from '../components/ui/DaemonButton'
import { apiFetchJson } from '../lib/api'
import { DAY_QUERY_STALE_MS, ORB_LAYOUT_ID } from '../lib/constants'
import type { SessionTodayResponse } from '../types'

export function Session() {
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['session-today'],
    queryFn: () => apiFetchJson<SessionTodayResponse>('/session/today'),
    // A ready deck holds all day; "not ready" must stay stale so the screen
    // re-asks the server once the overnight deck lands instead of caching
    // this morning's miss for 23 hours.
    staleTime: query => (query.state.data?.ready ? DAY_QUERY_STALE_MS : 0),
  })

  function handleComplete(fragmentCount: number) {
    queryClient.invalidateQueries({ queryKey: ['session-today'] })
    navigate('/session/complete', { state: { fragmentCount } })
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
        <DaemonButton onClick={() => navigate('/home')}>Return home →</DaemonButton>
      </div>
    )
  }

  return <SessionContainer fragments={data.fragments} onComplete={handleComplete} />
}
