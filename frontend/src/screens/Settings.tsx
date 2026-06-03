import { useNavigate } from 'react-router-dom'
import { jwtDecode } from 'jwt-decode'
import { ArrowLeft } from 'lucide-react'
import { DaemonButton } from '../components/ui/DaemonButton'
import { BottomNav } from '../components/ui/BottomNav'
import { useAuthStore } from '../stores/authStore'

export function Settings() {
  const navigate = useNavigate()
  const { token, logout } = useAuthStore()

  const email = token
    ? (jwtDecode<{ email: string }>(token).email ?? '')
    : ''

  function handleSignOut() {
    logout()
    navigate('/welcome', { replace: true })
  }

  return (
    <>
      <div className="screen" style={{ overflowY: 'auto', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        <div style={{ padding: 'var(--space-10) var(--space-5) var(--space-8)', maxWidth: 480, margin: '0 auto' }}>
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
        </div>
      </div>

      <BottomNav />
    </>
  )
}
