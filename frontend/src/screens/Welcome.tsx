import { motion } from 'framer-motion'
import { useNavigate, Navigate } from 'react-router-dom'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { GlassCard } from '../components/ui/GlassCard'
import { useAuthStore } from '../stores/authStore'

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
      <div style={{ height: '40vh', display: 'flex', alignItems: 'center' }}>
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
        maxWidth: '280px',
        margin: 0,
      }}>
        This isn&apos;t a wellness app.<br />
        It&apos;s a game. And the only opponent<br />
        is who you&apos;ve been.
      </p>

      <GlassCard
        onClick={() => navigate('/auth/register')}
        style={{ cursor: 'pointer', padding: '1rem 2rem', width: '100%', maxWidth: '280px' }}
      >
        <span style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-base)',
          color: 'var(--text-primary)',
        }}>
          I&apos;m ready to begin →
        </span>
      </GlassCard>

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
          minHeight: 44,
        }}
      >
        I have an account
      </button>
    </motion.div>
  )
}
