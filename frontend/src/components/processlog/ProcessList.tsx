import { ProcessEntry } from './ProcessEntry'
import type { ProcessEntryData } from '../../types'

interface ProcessListProps {
  entries: ProcessEntryData[]
}

export function ProcessList({ entries }: ProcessListProps) {
  const namedCount   = entries.filter(e => !e.unnamed).length
  const unnamedCount = entries.filter(e => e.unnamed).length
  const newCount     = entries.filter(e => e.state === 'new').length

  const summaryParts = [
    namedCount   > 0 ? `${namedCount} named`    : null,
    unnamedCount > 0 ? `${unnamedCount} unnamed` : null,
    newCount     > 0 ? `${newCount} new`         : null,
  ].filter((s): s is string => s !== null)

  return (
    <div style={{ width: '100%' }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h2 style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-lg)',
          lineHeight: 'var(--leading-lg)',
          fontWeight: 400,
          color: 'var(--text-primary)',
          marginBottom: 'var(--space-1)',
        }}>
          Process Log
        </h2>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)',
          lineHeight: 'var(--leading-sm)',
          color: 'var(--text-muted)',
        }}>
          {summaryParts.join(' · ')}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {entries.map(entry => (
          <ProcessEntry
            key={entry.id}
            name={entry.name}
            state={entry.state}
            strength={entry.strength}
            unnamed={entry.unnamed}
            firstDetected={entry.firstDetected}
            lastSeen={entry.lastSeen}
            daemonNote={entry.daemonNote}
          />
        ))}
      </div>
    </div>
  )
}
