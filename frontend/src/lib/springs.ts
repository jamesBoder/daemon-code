import type { Transition } from 'framer-motion'

export const springs: Record<string, Transition> = {
  snappy:  { type: 'spring', stiffness: 400, damping: 30 },
  smooth:  { type: 'spring', stiffness: 200, damping: 25 },
  slow:    { type: 'spring', stiffness: 80,  damping: 20 },
  reveal:  { type: 'spring', stiffness: 150, damping: 22, delay: 0.1 },
}
