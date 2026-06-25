import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { DecodeText } from '../components/daemon/DecodeText'
import { NamingCeremony } from '../components/daemon/NamingCeremony'
import { DaemonButton } from '../components/ui/DaemonButton'
import { apiFetchJson } from '../lib/api'
import { haptic } from '../lib/haptics'
import { playSound } from '../lib/sound'
import { pulseGrain } from '../lib/grain'
import { LETTER_SPACING_PROCESS, LETTER_SPACING_TIGHT, LETTER_SPACING_WIDE, MODAL_MAX_WIDTH } from '../lib/constants'
import type { ShadowProfile, OrbState, ProcessDiff, RecentDiffResponse } from '../types'

// named first (most dramatic), then new processes, then strength changes
const DIFF_CHANGE_ORDER: Record<string, number> = {
  named:         0,
  new:           1,
  strength_up:   2,
  strength_down: 3,
}

export function SessionComplete() {
  const navigate      = useNavigate()
  const queryClient   = useQueryClient()
  const location      = useLocation()

  const state         = location.state as { fragmentCount?: number; daemonLine?: string } | null
  const fragmentCount = state?.fragmentCount ?? 0
  const daemonLine    = state?.daemonLine

  const [ceremonyDone, setCeremonyDone] = useState(false)

  useEffect(() => {
    haptic('success')
    playSound('complete')   // subtle ascending acknowledgment — the session closed
    queryClient.invalidateQueries({ queryKey: ['profile'] })
  }, [])

  // The signature grain swells the moment the daemon speaks, then settles.
  useEffect(() => {
    if (daemonLine) pulseGrain()
  }, [daemonLine])

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiFetchJson<ShadowProfile>('/profile'),
    staleTime: Infinity,
  })

  const { data: diffResponse, isLoading: diffLoading } = useQuery({
    queryKey: ['session-diff'],
    queryFn:  () => apiFetchJson<RecentDiffResponse>('/session/recent-diff'),
    staleTime: Infinity,  // point-in-time — never refetch
  })

  const diff = [...(diffResponse?.diff ?? [])].sort(
    (a, b) => (DIFF_CHANGE_ORDER[a.change] ?? 9) - (DIFF_CHANGE_ORDER[b.change] ?? 9)
  )

  useEffect(() => {
    if (diff.some(d => d.change === 'named')) haptic('named')
  }, [diff])

  const orbState = (profile?.stage || 'cold') as OrbState

  if (profileLoading || diffLoading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <DaemonOrb state="cold" />
      </div>
    )
  }

  const namedDiffs = diff.filter(d => d.change === 'named')

  if (namedDiffs.length > 0 && !ceremonyDone) {
    return (
      <NamingCeremony
        names={namedDiffs.map(d => d.name)}
        orbState={orbState}
        audioUrl={diffResponse?.namingAudioUrl}
        onComplete={() => setCeremonyDone(true)}
      />
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 'var(--space-6)',
      padding: 'var(--space-8)',
    }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE }}>
        session complete
      </p>

      <DaemonOrb state={orbState} />

      {/* Immediate, deterministic daemon line from the live scorer (no AI),
          revealed with a decode effect — the daemon composing what it says. */}
      {daemonLine && (
        <div style={{ width: '100%', maxWidth: MODAL_MAX_WIDTH, textAlign: 'center' }}>
          <DecodeText
            text={daemonLine}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl)',
              lineHeight: 'var(--leading-xl)',
              fontWeight: 300,
              color: 'var(--text-daemon)',
              letterSpacing: LETTER_SPACING_TIGHT,
            }}
          />
        </div>
      )}

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
  const monoBase = { fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)', letterSpacing: LETTER_SPACING_PROCESS }

  if (entry.change === 'named') {
    return (
      <div className="glass-card" style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <span style={{ ...monoBase, color: 'var(--text-muted)', wordBreak: 'break-word' }}>
          {entry.from_name ?? '—'}
        </span>
        <span style={{ ...monoBase, color: 'var(--text-muted)', flexShrink: 0 }}>→</span>
        <span style={{ ...monoBase, color: 'var(--accent)', wordBreak: 'break-word' }}>
          {entry.name}
        </span>
      </div>
    )
  }

  if (entry.change === 'new') {
    return (
      <div className="glass-card" style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={{ ...monoBase, color: 'var(--text-primary)', minWidth: 0, wordBreak: 'break-word' }}>
          {entry.name}
        </span>
        <span style={{ ...monoBase, color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE, flexShrink: 0 }}>
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
    <div className="glass-card" style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
      <span style={{ ...monoBase, color: 'var(--text-primary)', minWidth: 0, wordBreak: 'break-word' }}>
        {entry.name}
      </span>
      <span style={{ ...monoBase, color, letterSpacing: LETTER_SPACING_WIDE, flexShrink: 0 }}>
        {arrow} strength{deltaStr}
      </span>
    </div>
  )
}
