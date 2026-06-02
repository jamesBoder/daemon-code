import { GlassCard } from './GlassCard'
import type { CompileStat } from '../../types'

interface CompileCardProps {
  day: number
  stats: CompileStat[]
  animate?: boolean
}

export function CompileCard({ day, stats, animate = false }: CompileCardProps) {
  return (
    <GlassCard animate={animate} style={{ padding: 'var(--space-5) var(--space-6)', width: '100%' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-3)',
        paddingBottom: 'var(--space-3)',
        borderBottom: '0.5px solid var(--border)',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-mono)',
          lineHeight: 'var(--leading-mono)',
          color: 'var(--compile-green)',
          letterSpacing: '0.05em',
        }}>
          compile complete
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-mono)',
          lineHeight: 'var(--leading-mono)',
          color: 'var(--text-muted)',
          letterSpacing: '0.05em',
        }}>
          day {day}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {stats.map((stat, i) => (
          <StatRow key={i} {...stat} />
        ))}
      </div>
    </GlassCard>
  )
}

function StatRow({ label, value, delta, suffix = '', text, highlight }: CompileStat) {
  const deltaColor = delta !== undefined
    ? (delta >= 0 ? 'var(--compile-green)' : 'var(--warning)')
    : undefined
  const deltaSign = delta !== undefined && delta > 0 ? '+' : ''

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-sm)',
        lineHeight: 'var(--leading-sm)',
        color: 'var(--text-secondary)',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-mono)',
        lineHeight: 'var(--leading-mono)',
        color: highlight ? 'var(--accent)' : 'var(--text-primary)',
        letterSpacing: '0.02em',
      }}>
        {text ?? (
          <>
            {value}{suffix}
            {delta !== undefined && delta !== 0 && (
              <span style={{ color: deltaColor, marginLeft: 4 }}>
                ({deltaSign}{delta})
              </span>
            )}
          </>
        )}
      </span>
    </div>
  )
}
