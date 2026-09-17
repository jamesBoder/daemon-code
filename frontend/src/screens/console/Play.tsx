import { ConsoleShell } from '../../components/console/ConsoleShell'

// PLAY's idle/playing/complete states (docs/simplify-pass.md, "Frontend spec:
// PLAY tab") are a separate, later task — this is a placeholder proving the
// ConsoleShell frame and routing work, not the finished tab.
export function Play() {
  return (
    <ConsoleShell active="play">
      <div style={{ padding: 'var(--space-6)' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
          PLAY
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
          idle / playing / complete states — not yet built
        </p>
      </div>
    </ConsoleShell>
  )
}
