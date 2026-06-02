import type { ReactNode, CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { springs } from '../../lib/springs'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { REDUCED_MOTION_DURATION } from '../../lib/constants'

interface GlassCardProps {
  children: ReactNode
  elevated?: boolean
  animate?: boolean
  className?: string
  style?: CSSProperties
  onClick?: () => void
}

export function GlassCard({
  children,
  elevated = false,
  animate = false,
  className = '',
  style,
  onClick,
}: GlassCardProps) {
  const reduced = useReducedMotion()
  const baseClass = elevated ? 'glass-card glass-card-elevated' : 'glass-card'

  if (!animate) {
    return (
      <div className={`${baseClass} ${className}`} style={style} onClick={onClick}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={`${baseClass} ${className}`}
      style={style}
      onClick={onClick}
      initial={{ opacity: 0, y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : -4 }}
      transition={reduced ? { duration: REDUCED_MOTION_DURATION } : springs.reveal}
    >
      {children}
    </motion.div>
  )
}
