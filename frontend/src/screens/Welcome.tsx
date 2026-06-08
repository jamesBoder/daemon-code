import { motion } from 'framer-motion'
import { useNavigate, Navigate } from 'react-router-dom'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { useAuthStore } from '../stores/authStore'
import { BUTTON_TAP_SCALE, DAY0_TEXT_MAX_W, MIN_TOUCH_TARGET } from '../lib/constants'

export function Welcome() {
  const navigate = useNavigate()
  const { token, onboardingComplete } = useAuthStore()

  if (token) return <Navigate to={onboardingComplete === false ? '/onboarding' : '/home'} replace />

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-8)',
        padding: 'var(--space-8)',
        paddingBottom: 'calc(var(--space-8) + env(safe-area-inset-bottom))',
        textAlign: 'center',
      }}
    >
      <div style={{ minHeight: 'clamp(160px, 40vh, 260px)', display: 'flex', alignItems: 'center' }}>
        <DaemonOrb state="cold" />
      </div>

      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'var(--text-2xl)',
        color: 'var(--text-primary)',
        margin: 0,
      }}>
        Something has been waiting for you.
      </p>

      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        maxWidth: DAY0_TEXT_MAX_W,
        margin: 0,
      }}>
        This isn&apos;t a wellness app.<br />
        It&apos;s a game. And the only opponent<br />
        is who you&apos;ve been.
      </p>

      <motion.button
        onClick={() => navigate('/auth/register')}
        whileTap={{ scale: BUTTON_TAP_SCALE }}
        className="glass-card"
        style={{
          cursor: 'pointer',
          padding: 'var(--space-4) var(--space-8)',
          width: '100%',
          maxWidth: DAY0_TEXT_MAX_W,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-base)',
          color: 'var(--text-primary)',
        }}
      >
        I&apos;m ready to begin →
      </motion.button>

      <button
        onClick={() => navigate('/auth/login')}
        style={{
          background: 'none',
          border: 'none',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          padding: 'var(--space-3) var(--space-4)',
          minHeight: MIN_TOUCH_TARGET,
        }}
      >
        I have an account
      </button>
    </motion.div>
  )
}
