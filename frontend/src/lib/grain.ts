import { GRAIN_PULSE_MS } from './constants'

// pulseGrain briefly swells the global noise overlay (body::after) and lets it
// settle — tying the app's signature grain to a moment the daemon "notices".
// Driven by a class toggle so the effect lives in CSS (see index.css); it is an
// opacity flicker, not spatial motion, so it is intentionally not reduced-motion
// gated. Re-triggerable: the class is cleared and reflowed to restart.
let timer: ReturnType<typeof setTimeout> | undefined

export function pulseGrain(): void {
  const body = document.body
  body.classList.remove('grain-pulse')
  void body.offsetWidth // force reflow so the animation restarts on rapid re-triggers
  body.classList.add('grain-pulse')

  clearTimeout(timer)
  timer = setTimeout(() => body.classList.remove('grain-pulse'), GRAIN_PULSE_MS)
}
