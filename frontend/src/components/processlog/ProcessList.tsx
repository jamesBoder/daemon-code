import { ProcessEntry } from './ProcessEntry'
import { copy } from '../../lib/copy'
import { LETTER_SPACING_WIDE } from '../../lib/constants'
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
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-base)',
          lineHeight: 'var(--leading-base)',
          fontWeight: 300,
          color: 'var(--text-secondary)',
          marginBottom: 'var(--space-3)',
        }}>
          {copy.processLog.description}
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          letterSpacing: LETTER_SPACING_WIDE,
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
