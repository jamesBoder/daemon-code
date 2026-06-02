import { GlassCard } from './GlassCard'

interface DailySignalProps {
  quote: string
  author: string
  animate?: boolean
}

export function DailySignal({ quote, author, animate = false }: DailySignalProps) {
  return (
    <GlassCard animate={animate} style={{ padding: 'var(--space-5) var(--space-6)', width: '100%' }}>
      <blockquote style={{ margin: 0 }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-sm)',
          lineHeight: 'var(--leading-sm)',
          fontWeight: 300,
          color: 'var(--text-daemon)',
          letterSpacing: '-0.01em',
          fontStyle: 'italic',
          marginBottom: 'var(--space-2)',
        }}>
          "{quote}"
        </p>
        <footer style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-mono)',
          lineHeight: 'var(--leading-mono)',
          color: 'var(--text-muted)',
          letterSpacing: '0.05em',
        }}>
          — {author}
        </footer>
      </blockquote>
    </GlassCard>
  )
}
