import { motion } from 'framer-motion'

export function BlinkCursor() {
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 1.0, repeat: Infinity, times: [0, 0.5, 1], ease: 'linear' }}
      style={{ color: 'var(--compile-green)', marginLeft: '0.3em' }}
    >
      ▋
    </motion.span>
  )
}
