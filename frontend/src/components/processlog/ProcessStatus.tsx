import type { ProcessState } from '../../types'

const STATUS = {
  padV:    2,  // px — vertical padding on state badge
  dotSize: 6,  // px — running state pulse indicator diameter
} as const

interface ProcessStatusProps {
  state: ProcessState
}

// Shared by ProcessList section headers and ProcessEntry strength bars
export const PROCESS_STATE_COLORS: Record<ProcessState, string> = {
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
  const color = PROCESS_STATE_COLORS[state]

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-1)',
      padding: `${STATUS.padV}px var(--space-2)`,
      borderRadius: 'var(--radius-full)',
      border: `0.5px solid ${color}`,
      background: `color-mix(in srgb, ${color} 10%, transparent)`,
      flexShrink: 0,
    }}>
      {state === 'running' && (
        <div style={{ position: 'relative', width: STATUS.dotSize, height: STATUS.dotSize }}>
          <div style={{
            width: STATUS.dotSize,
            height: STATUS.dotSize,
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
