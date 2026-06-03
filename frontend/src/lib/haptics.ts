import { HAPTICS_KEY } from './constants'

const PATTERNS: Record<string, number[]> = {
  tap:     [10],
  success: [10, 30, 10],
  named:   [30, 20, 30, 20, 60],
}

export function haptic(pattern: keyof typeof PATTERNS) {
  if (!navigator.vibrate) return
  if (localStorage.getItem(HAPTICS_KEY) === 'false') return
  navigator.vibrate(PATTERNS[pattern])
}
