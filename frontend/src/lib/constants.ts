// Reduced motion fallback — used across all animated components
export const REDUCED_MOTION_DURATION = 0.15   // seconds

// Compile animation timing (seconds) — total sequence ≈ 4.5s from screen open
// AUTOPLAY_DELAY puts the GSAP start at 0.3s into the screen open, per roadmap spec.
export const COMPILE_AUTOPLAY_DELAY       = 300    // ms before GSAP timeline starts
export const COMPILE_LINE_STAGGER         = 0.18   // between each line appearing
export const COMPILE_LINE_DURATION        = 0.20   // to reveal each line
export const COMPILE_STATS_DELAY          = 0.05   // gap after last line before stats
export const COMPILE_STATS_DURATION       = 0.30   // to reveal each stat
export const COMPILE_STATS_STAGGER        = 0.08   // between each stat row
export const COMPILE_FADEOUT_DELAY        = 0.40   // pause after stats before terminal fades
export const COMPILE_FADEOUT_DURATION     = 0.30   // terminal lines fade out (1.8s mark)
export const COMPILE_PROSE_DELAY          = 0.10   // after fade-out before prose appears (2.2s mark)
export const COMPILE_PROSE_DURATION       = 0.60   // prose fade-in
export const COMPILE_SIGNAL_DELAY         = 1.60   // after prose starts before signal (3.8s mark)
export const COMPILE_SIGNAL_DURATION      = 0.40   // daily signal fade-in

// Layout
export const MAX_CONTENT_WIDTH = 480   // px — max page width (mobile-first)
export const PROSE_MAX_WIDTH   = 320   // px — max width for daemon prose text
