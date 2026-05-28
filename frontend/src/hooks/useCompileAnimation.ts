import { useRef, useCallback } from 'react'
import type { RefObject } from 'react'
import gsap from 'gsap'
import {
  COMPILE_LINE_STAGGER,
  COMPILE_LINE_DURATION,
  COMPILE_STATS_DELAY,
  COMPILE_STATS_DURATION,
  COMPILE_STATS_STAGGER,
  COMPILE_FADEOUT_DELAY,
  COMPILE_FADEOUT_DURATION,
  COMPILE_PROSE_DELAY,
  COMPILE_PROSE_DURATION,
  COMPILE_SIGNAL_DELAY,
  COMPILE_SIGNAL_DURATION,
} from '../lib/constants'

interface CompileAnimationControls {
  containerRef: RefObject<HTMLDivElement | null>
  play: (onFadeOut?: () => void) => void
  reset: () => void
}

export function useCompileAnimation(): CompileAnimationControls {
  const containerRef = useRef<HTMLDivElement>(null)
  const tlRef = useRef<gsap.core.Timeline | null>(null)

  const play = useCallback((onFadeOut?: () => void) => {
    if (!containerRef.current) return

    const container = containerRef.current
    const lines  = container.querySelectorAll('[data-compile-line]')
    const stats  = container.querySelectorAll('[data-compile-stats]')
    const prose  = container.querySelector('[data-compile-prose]')
    const signal = container.querySelector('[data-compile-signal]')

    tlRef.current?.kill()
    const tl = gsap.timeline()

    gsap.set([lines, stats, prose, signal], { opacity: 0, y: 6 })

    // Lines appear one by one
    lines.forEach((line, i) => {
      tl.to(line, {
        opacity: 1,
        y: 0,
        duration: COMPILE_LINE_DURATION,
        ease: 'power2.out',
      }, i * COMPILE_LINE_STAGGER)
    })

    // Stats appear after lines
    tl.to(stats, {
      opacity: 1,
      y: 0,
      duration: COMPILE_STATS_DURATION,
      stagger: COMPILE_STATS_STAGGER,
      ease: 'power2.out',
    }, `+=${COMPILE_STATS_DELAY}`)

    // Terminal text fades out — fire orb pulse callback at same time (1.8s mark)
    tl.to([lines, stats], {
      opacity: 0,
      duration: COMPILE_FADEOUT_DURATION,
      ease: 'power2.in',
    }, `+=${COMPILE_FADEOUT_DELAY}`)

    if (onFadeOut) {
      tl.add(onFadeOut, '<')
    }

    // Prose fades in (2.2s mark)
    tl.to(prose, {
      opacity: 1,
      y: 0,
      duration: COMPILE_PROSE_DURATION,
      ease: 'power2.out',
    }, `+=${COMPILE_PROSE_DELAY}`)

    // Daily Signal fades in (3.8s mark)
    tl.to(signal, {
      opacity: 1,
      y: 0,
      duration: COMPILE_SIGNAL_DURATION,
      ease: 'power2.out',
    }, `<+=${COMPILE_SIGNAL_DELAY}`)

    tlRef.current = tl
  }, [])

  const reset = useCallback(() => {
    tlRef.current?.kill()
    if (!containerRef.current) return
    const all = containerRef.current.querySelectorAll(
      '[data-compile-line],[data-compile-stats],[data-compile-prose],[data-compile-signal]'
    )
    gsap.set(all, { opacity: 0, y: 6 })
  }, [])

  return { containerRef, play, reset }
}
