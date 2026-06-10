import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { HAIRLINE, LETTER_SPACING_WIDE } from '../../lib/constants'

interface Props {
  /** Mounts with a 0.8s entry delay after the Pulse query resolves. */
  visible: boolean
}

export function PulseEntryCard({ visible }: Props) {
  const navigate = useNavigate()
  const reduced  = useReducedMotion()

  if (!visible) return null

  return (
    <motion.button
      initial={{ opacity: 0, y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.4, delay: 0.8 }}
      whileTap={{ scale: 0.98, opacity: 0.85 }}
      onClick={() => navigate('/pulse')}
      style={{
        width: '100%',
        background: 'transparent',
        border: `${HAIRLINE} solid var(--border)`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4) var(--space-5)',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <AccentDot />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--text-base)',
          color: 'var(--text-primary)',
          lineHeight: 'var(--leading-snug)',
        }}>
          the daemon is reading.
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          letterSpacing: LETTER_SPACING_WIDE,
        }}>
          one signal · now →
        </span>
      </div>
    </motion.button>
  )
}

function AccentDot() {
  const reduced = useReducedMotion()

  return (
    <motion.span
      animate={reduced ? {} : { opacity: [0.3, 1, 0.3] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        flexShrink: 0,
        width: 4,
        height: 4,
        borderRadius: '50%',
        background: 'var(--accent)',
      }}
    />
  )
}
