import { motion } from 'framer-motion'
import { springs } from '../../lib/springs'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { REDUCED_MOTION_DURATION } from '../../lib/constants'

interface DaemonProseProps {
  text: string
  size?: 'xl' | '2xl' | '3xl'
  animate?: boolean
  delay?: number
  showMicIcon?: boolean
  onMicClick?: () => void
}

const sizeMap = {
  xl:    'var(--text-xl)',
  '2xl': 'var(--text-2xl)',
  '3xl': 'var(--text-3xl)',
}

// Roadmap type scale specifies explicit line heights per display size
const lineHeightMap = {
  xl:    'var(--leading-xl)',
  '2xl': 'var(--leading-2xl)',
  '3xl': 'var(--leading-3xl)',
}

export function DaemonProse({
  text,
  size = 'xl',
  animate = false,
  delay = 0,
  showMicIcon = false,
  onMicClick,
}: DaemonProseProps) {
  const reduced = useReducedMotion()

  const content = (
    <div style={{ position: 'relative' }}>
      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: sizeMap[size],
        lineHeight: lineHeightMap[size],
        fontWeight: 300,
        color: 'var(--text-daemon)',
        letterSpacing: '-0.01em',
        paddingRight: showMicIcon ? 'var(--space-6)' : 0,
      }}>
        {text}
      </p>
      {showMicIcon && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onMicClick?.() }}
          aria-label="Listen to daemon voice"
          style={{
            position: 'absolute',
            top: 2,
            right: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            padding: 0,
            lineHeight: 1,
            fontSize: 14,
          }}
        >
          ⏵
        </button>
      )}
    </div>
  )

  if (!animate) return content

  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced
        ? { duration: REDUCED_MOTION_DURATION }
        : { ...springs.reveal, delay }
      }
    >
      {content}
    </motion.div>
  )
}
