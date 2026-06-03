import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { DaemonButton } from '../components/ui/DaemonButton'
import { apiFetchJson } from '../lib/api'
import type { ShadowProfile, OrbState } from '../types'

export function SessionComplete() {
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const location     = useLocation()

  const state         = location.state as { fragmentCount?: number } | null
  const fragmentCount = state?.fragmentCount ?? 0

  // Invalidate profile so Home reflects any changes from this session
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['profile'] })
  }, [])

  // Read profile from cache — Home already fetched it, so no network call needed
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiFetchJson<ShadowProfile>('/profile'),
    staleTime: Infinity,
  })

  const orbState = (profile?.stage || 'cold') as OrbState

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 'var(--space-8)',
      padding: 'var(--space-8)',
    }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
        session complete
      </p>

      <DaemonOrb state={orbState} />

      {fragmentCount > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-5) var(--space-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 320 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            session fragments
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--compile-green)' }}>
            {fragmentCount} completed
          </span>
        </div>
      )}

      <DaemonButton onClick={() => navigate('/home', { replace: true })}>
        Done
      </DaemonButton>
    </div>
  )
}
