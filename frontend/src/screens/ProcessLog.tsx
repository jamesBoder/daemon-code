import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { ProcessList } from '../components/processlog/ProcessList'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { BottomNav } from '../components/ui/BottomNav'
import { apiFetchJson } from '../lib/api'
import type { Process, ProcessEntryData, ProcessState } from '../types'

function toProcessEntryData(p: Process, index: number): ProcessEntryData {
  return {
    id:            p.id,
    name:          p.name ?? `unnamed_process_${String(index).padStart(3, '0')}`,
    state:         p.state as ProcessState,
    strength:      p.strength,
    unnamed:       p.unnamed,
    firstDetected: p.first_detected,
    lastSeen:      p.last_seen ?? undefined,
    daemonNote:    p.daemon_note ?? undefined,
  }
}

export function ProcessLog() {
  const navigate = useNavigate()

  const { data: processes, isLoading } = useQuery({
    queryKey: ['processes'],
    queryFn: () => apiFetchJson<Process[]>('/processes'),
    staleTime: 5 * 60 * 1000,
  })

  const entries = (processes ?? []).map(toProcessEntryData)

  return (
    <>
      <div className="screen" style={{ overflowY: 'auto', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        {/* Back nav */}
        <div style={{ padding: 'var(--space-5) var(--space-5) 0', display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => navigate('/home')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-2)', minHeight: 44 }}
          >
            <ArrowLeft size={16} strokeWidth={1.5} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>home</span>
          </button>
        </div>

        <div style={{ padding: 'var(--space-6) var(--space-5) var(--space-8)' }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-16)' }}>
              <DaemonOrb state="cold" />
            </div>
          ) : entries.length === 0 ? (
            <div style={{ paddingTop: 'var(--space-16)', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)', maxWidth: 280, margin: '0 auto' }}>
                The daemon is building its first picture.<br />
                Check back tomorrow.
              </p>
            </div>
          ) : (
            <ProcessList entries={entries} />
          )}
        </div>
      </div>

      <BottomNav />
    </>
  )
}
