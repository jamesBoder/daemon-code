import './App.css'

function App() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '0 20px',
        gap: '32px',
      }}
    >
      {/* Wordmark */}
      <p
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 'var(--text-mono)',
          letterSpacing: '0.3em',
          color: 'var(--text-muted)',
          textTransform: 'lowercase',
        }}
      >
        daemon code
      </p>

      {/* Orb placeholder */}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'var(--surface)',
          border: '0.5px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'var(--background)',
            border: '0.5px solid var(--border-subtle)',
          }}
        />
      </div>

      {/* Daemon prose placeholder */}
      <p
        style={{
          fontFamily: "'Fraunces', serif",
          fontSize: 'var(--text-xl)',
          fontWeight: 300,
          color: 'var(--text-daemon)',
          textAlign: 'center',
          maxWidth: 320,
          lineHeight: 1.5,
          letterSpacing: '-0.01em',
        }}
      >
        Something has been waiting for you.
      </p>

      {/* Status */}
      <p
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 'var(--text-mono)',
          color: 'var(--text-muted)',
          letterSpacing: '0.05em',
        }}
      >
        {">"} initializing...
      </p>
    </div>
  )
}

export default App
