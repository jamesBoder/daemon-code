import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { jwtDecode } from 'jwt-decode'
import { ArrowLeft } from 'lucide-react'
import { DaemonButton } from '../components/ui/DaemonButton'
import { BottomNav } from '../components/ui/BottomNav'
import { useAuthStore } from '../stores/authStore'
import { HAPTICS_KEY, MAX_CONTENT_WIDTH, ROUTE_TRANSITION_MS } from '../lib/constants'

const TOGGLE = {
  trackW:   40,
  trackH:   24,
  radius:   12,
  dotSize:  18,
  dotPad:   3,
  get dotOn()  { return this.trackW - this.dotSize - this.dotPad },
  transS: `${ROUTE_TRANSITION_MS / 1000}s`,
}

export function Settings() {
  const navigate = useNavigate()
  const { token, logout } = useAuthStore()

  const email = token
    ? (jwtDecode<{ email: string }>(token).email ?? '')
    : ''

  const [hapticsEnabled, setHapticsEnabled] = useState(
    () => localStorage.getItem(HAPTICS_KEY) !== 'false'
  )

  function handleHapticsToggle() {
    const next = !hapticsEnabled
    localStorage.setItem(HAPTICS_KEY, String(next))
    setHapticsEnabled(next)
  }

  function handleSignOut() {
    logout()
    navigate('/welcome', { replace: true })
  }

  return (
    <>
      <div className="screen" style={{ overflowY: 'auto', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        <div style={{ padding: 'var(--space-10) var(--space-5) var(--space-8)', maxWidth: MAX_CONTENT_WIDTH, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-8)' }}>
            <button
              onClick={() => navigate('/home')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 'var(--space-2)', minHeight: 44, minWidth: 44 }}
            >
              <ArrowLeft size={16} strokeWidth={1.5} />
            </button>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)', color: 'var(--text-primary)', margin: 0 }}>
              Settings
            </p>
          </div>

          <div className="glass-card" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Account
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              {email}
            </p>
            <DaemonButton
              variant="secondary"
              onClick={handleSignOut}
              style={{ color: 'var(--warning)', borderColor: 'var(--warning)' }}
            >
              Sign out
            </DaemonButton>
          </div>

          <div className="glass-card" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Preferences
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
                Haptic feedback
              </p>
              <button
                role="switch"
                aria-checked={hapticsEnabled}
                onClick={handleHapticsToggle}
                style={{
                  width: TOGGLE.trackW, height: TOGGLE.trackH, borderRadius: TOGGLE.radius, flexShrink: 0,
                  background: hapticsEnabled ? 'var(--accent)' : 'var(--border)',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  transition: `background ${TOGGLE.transS}`,
                }}
              >
                <span style={{
                  position: 'absolute',
                  top: TOGGLE.dotPad, left: hapticsEnabled ? TOGGLE.dotOn : TOGGLE.dotPad,
                  width: TOGGLE.dotSize, height: TOGGLE.dotSize, borderRadius: '50%',
                  background: 'var(--text-primary)',
                  display: 'block',
                  transition: `left ${TOGGLE.transS}`,
                }} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <BottomNav />
    </>
  )
}
