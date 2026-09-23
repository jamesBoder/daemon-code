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
  // Opt-in ambient accent glow (breathing box-shadow, see .daemon-btn-glow in
  // index.css) for the one actionable CTA on a screen -- deliberately NOT the
  // default, since this button is reused everywhere (auth, settings, confirm
  // modals) and most of those are plain forms, not a single highlighted action.
  // Primary only: .daemon-btn-glow's keyframes redeclare primary's resting
  // shadow stack, which would visually clash with secondary's flat/borderless
  // style, so it's silently ignored on variant="secondary" rather than left
  // as a caller footgun.
  glow?: boolean
}

export function DaemonButton({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  type = 'button',
  style,
  glow = false,
}: DaemonButtonProps) {
  const reduced = useReducedMotion()

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`daemon-btn daemon-btn-${variant}${glow && !disabled && variant === 'primary' ? ' daemon-btn-glow' : ''}`}
      whileTap={reduced ? {} : { scale: 0.98 }}
      style={style}
    >
      {children}
    </motion.button>
  )
}
