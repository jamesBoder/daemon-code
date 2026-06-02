import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import { GlassCard } from '../components/ui/GlassCard'

export function Welcome() {
  const navigate = useNavigate()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2rem',
        padding: '2rem',
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
        fontFamily: 'var(--font-body)',
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
          fontFamily: 'var(--font-body)',
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
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          padding: '0.5rem',
        }}
      >
        I have an account
      </button>
    </motion.div>
  )
}
