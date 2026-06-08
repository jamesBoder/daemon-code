import { useQuery } from '@tanstack/react-query'
import { ProcessList } from '../components/processlog/ProcessList'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { SignalWhisper } from '../components/daemon/SignalWhisper'
import { BottomNav } from '../components/ui/BottomNav'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { apiFetchJson } from '../lib/api'
import { BOTTOM_NAV_HEIGHT, SCREEN_HEADER_HEIGHT } from '../lib/constants'
import { copy } from '../lib/copy'
import type { Process, ProcessEntryData, ProcessState } from '../types'

const PROCESS_LOG = {
  stateMaxW: 280,  // px — narrower than PROSE_MAX_WIDTH; fits two-line messages without excess line length
} as const

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
  const { data: processes, isLoading, isError } = useQuery({
    queryKey: ['processes'],
    queryFn: () => apiFetchJson<Process[]>('/processes'),
    staleTime: 5 * 60 * 1000,
  })

  const entries = (processes ?? []).map(toProcessEntryData)

  return (
    <>
      <ScreenHeader title="process log" />
      <div className="screen" style={{ overflowY: 'auto', paddingTop: `calc(${SCREEN_HEADER_HEIGHT}px + env(safe-area-inset-top))`, paddingBottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))` }}>
        <div style={{ padding: 'var(--space-6) var(--space-5) var(--space-8)' }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-16)' }}>
              <DaemonOrb state="cold" />
            </div>
          ) : isError ? (
            <div style={{ paddingTop: 'var(--space-16)', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-muted)', maxWidth: PROCESS_LOG.stateMaxW, margin: '0 auto' }}>
                Could not load processes.<br />
                Check your connection and try again.
              </p>
            </div>
          ) : entries.length === 0 ? (
            <div style={{ paddingTop: 'var(--space-16)', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)', maxWidth: PROCESS_LOG.stateMaxW, margin: '0 auto' }}>
                The daemon is building its first picture.<br />
                Check back tomorrow.
              </p>
            </div>
          ) : (
            <>
              <SignalWhisper
                hintKey="process_first"
                text={copy.signalHints.process_first}
                condition={entries.length > 0}
              />
              <ProcessList entries={entries} />
            </>
          )}
        </div>
      </div>

      <BottomNav />
    </>
  )
}
