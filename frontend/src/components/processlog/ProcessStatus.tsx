import type { ProcessState } from '../../types'

interface ProcessStatusProps {
  state: ProcessState
}

const statusColors: Record<ProcessState, string> = {
  running:   'var(--process-running)',
  sleeping:  'var(--process-sleeping)',
  weakening: 'var(--process-weakening)',
  new:       'var(--process-new)',
}

const statusLabels: Record<ProcessState, string> = {
  running:   'RUNNING',
  sleeping:  'SLEEPING',
  weakening: 'WEAKENING',
  new:       'NEW',
}

export function ProcessStatus({ state }: ProcessStatusProps) {
  const color = statusColors[state]

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-1)',
      padding: '2px var(--space-2)',
      borderRadius: 'var(--radius-full)',
      border: `0.5px solid ${color}`,
      background: `color-mix(in srgb, ${color} 10%, transparent)`,
      flexShrink: 0,
    }}>
      {state === 'running' && (
        <div style={{ position: 'relative', width: 6, height: 6 }}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            position: 'relative',
            zIndex: 1,
          }} />
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: color,
            animation: 'process-ping 2s cubic-bezier(0,0,0.2,1) infinite',
          }} />
        </div>
      )}

      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-mono)',
        lineHeight: 'var(--leading-mono)',
        color,
        letterSpacing: '0.05em',
      }}>
        {statusLabels[state]}
      </span>
    </div>
  )
}
