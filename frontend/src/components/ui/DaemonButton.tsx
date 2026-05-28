import type { ReactNode, CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'

interface DaemonButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  style?: CSSProperties
}

export function DaemonButton({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  type = 'button',
  style,
}: DaemonButtonProps) {
  const reduced = useReducedMotion()

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`daemon-btn daemon-btn-${variant}`}
      whileTap={reduced ? {} : { scale: 0.98 }}
      style={style}
    >
      {children}
    </motion.button>
  )
}
