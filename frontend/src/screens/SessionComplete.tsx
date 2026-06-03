import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { DaemonButton } from '../components/ui/DaemonButton'
import { apiFetchJson } from '../lib/api'
import { haptic } from '../lib/haptics'
import { MODAL_MAX_WIDTH } from '../lib/constants'
import type { ShadowProfile, OrbState, ProcessDiff } from '../types'

// named first (most dramatic), then new processes, then strength changes
const DIFF_CHANGE_ORDER: Record<string, number> = {
  named:         0,
  new:           1,
  strength_up:   2,
  strength_down: 3,
}

export function SessionComplete() {
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const location     = useLocation()

  const state         = location.state as { fragmentCount?: number } | null
  const fragmentCount = state?.fragmentCount ?? 0

  useEffect(() => {
    haptic('success')
    queryClient.invalidateQueries({ queryKey: ['profile'] })
  }, [])

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiFetchJson<ShadowProfile>('/profile'),
    staleTime: Infinity,
  })

  const { data: rawDiff = [] } = useQuery({
    queryKey: ['session-diff'],
    queryFn:  () => apiFetchJson<ProcessDiff[]>('/session/recent-diff'),
    staleTime: Infinity,  // point-in-time — never refetch
  })

  const diff = [...rawDiff].sort(
    (a, b) => (DIFF_CHANGE_ORDER[a.change] ?? 9) - (DIFF_CHANGE_ORDER[b.change] ?? 9)
  )

  useEffect(() => {
    if (diff.some(d => d.change === 'named')) haptic('named')
  }, [diff])

  const orbState = (profile?.stage || 'cold') as OrbState

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 'var(--space-6)',
      padding: 'var(--space-8)',
    }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
        session complete
      </p>

      <DaemonOrb state={orbState} />

      {/* Diff cards — shown when Analyst has run since last session */}
      {diff.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', width: '100%', maxWidth: MODAL_MAX_WIDTH }}>
          {diff.map(entry => (
            <DiffCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {/* Fragment count — fallback when no diff yet (Day 1, or Analyst hasn't run) */}
      {diff.length === 0 && fragmentCount > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-5) var(--space-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: MODAL_MAX_WIDTH }}>
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

function DiffCard({ entry }: { entry: ProcessDiff }) {
  if (entry.change === 'named') {
    return (
      <div className="glass-card" style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          {entry.from_name ?? '—'}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--text-muted)' }}>→</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--accent)', letterSpacing: '0.04em' }}>
          {entry.name}
        </span>
      </div>
    )
  }

  if (entry.change === 'new') {
    return (
      <div className="glass-card" style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
          {entry.name}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          new
        </span>
      </div>
    )
  }

  const isUp    = entry.change === 'strength_up'
  const arrow   = isUp ? '↑' : '↓'
  const color   = isUp ? 'var(--compile-green)' : 'var(--warning)'
  const deltaStr = entry.delta !== undefined
    ? ` ${isUp ? '+' : ''}${entry.delta}`
    : ''

  return (
    <div className="glass-card" style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
        {entry.name}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color, letterSpacing: '0.06em' }}>
        {arrow} strength{deltaStr}
      </span>
    </div>
  )
}
