import { ConsoleShell } from '../../components/console/ConsoleShell'

// SELF's real layout (image + archetype + stage line + capped patterns +
// recent takeaways, docs/simplify-pass.md "Frontend spec: SELF tab") is a
// separate, later task — this is a placeholder proving the ConsoleShell
// frame and routing work, not the finished tab.
export function SelfTab() {
  return (
    <ConsoleShell active="self">
      <div style={{ padding: 'var(--space-6)' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
          SELF
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
          image / archetype / patterns / takeaways — not yet built
        </p>
      </div>
    </ConsoleShell>
  )
}
