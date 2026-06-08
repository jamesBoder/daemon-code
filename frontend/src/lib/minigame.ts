/**
 * Central design config for all mini-game components.
 * Change values here — components contain no magic numbers.
 */
export const MG = {

  // ── Responsive breakpoint ──────────────────────────────────────────────────
  desktopBreakpoint: 768,

  // ── Shared drag track (WeightedScale + any future draggable game) ─────────
  track: {
    height:          52,    // px — total row height
    handleSize:      28,    // px — diameter of the draggable circle
    handleScale:     1.2,   // whileDrag scale multiplier
    dragElastic:     0.05,  // Framer Motion dragElastic
    edgeInset:       16,    // px — gap between handle edge and track end
  },

  // ── Spring physics — tap-to-jump and future snapping ──────────────────────
  spring: { stiffness: 220, damping: 26 },

  // ── WeightedScale specific ─────────────────────────────────────────────────
  scale: {
    armRotationDeg:  28,    // max tilt of the balance arm in either direction
    commitThreshold: 0.08,  // |value| must exceed this before "Next" appears
    dimmedAlpha:     0.35,  // label opacity when dragged to the opposite side
    hintOpacity:     0.55,  // opacity of "drag to balance" hint text
    svgDesktopWidth: 480,   // px — decorative arm SVG width on desktop
  },

  // ── ReactionTest specific ──────────────────────────────────────────────────
  reaction: {
    fadeInMs:       100,   // word fade-in duration
    fadeOutMs:      180,   // word fade-out duration
    flashMs:        120,   // accent-color flash duration after a tap
    flashTransition: '0.06s', // CSS color transition on the word span
    progressHeight:  2,    // px — progress bar height
    progressAnimS:   0.15, // s  — progress bar width animation
    ripple: {
      size:      56,   // px — ripple circle diameter at scale 1
      scale:     12,   // final scale multiplier
      durationS: 0.45, // animation duration in seconds
    },
  },

  // ── SpeedRound specific ────────────────────────────────────────────────────
  speed: {
    crossfadeMs: 80,   // opacity crossfade between prompts
    mobileMaxW:  380,  // px — container max-width on mobile viewport
  },

  // ── PredictionDuel specific ────────────────────────────────────────────────
  duel: {
    pauseMs:       400,  // dramatic beat between tap and reveal
    revealMs:      1500, // how long reveal text shows before onComplete fires
    revealFadeS:   0.3,  // reveal text fade-in duration
    cardTransition: '0.15s', // card border/color CSS transition
  },

  // ── Transitions — component-to-component and state-to-state ───────────────
  transition: {
    fragmentMs: 220,  // fade between session fragments
    pairMs:     150,  // fade between scale pairs
    promptMs:    80,  // speed round prompt crossfade (matches speed.crossfadeMs)
    stepMs:     250,  // onboarding step transitions
    revealS:    0.25, // generic reveal fade (confirm buttons, etc.)
  },

  // ── Session chrome (progress bar + exit button + mood) ────────────────────
  session: {
    closeW:        52,   // px — wider than 44 to clear safe-area edge
    closeH:        44,   // px — = MIN_TOUCH_TARGET
    closeIconSize: 18,
    closeStroke:   1.5,
    moodSize:      56,   // px — mood tile width and height
    moodTapScale:  0.92, // mild tap (larger target — softer than BUTTON_TAP_SCALE)
  },

  // ── Onboarding compile animation ──────────────────────────────────────────
  compile: {
    lineDelays: [400, 1200, 2000] as readonly number[], // ms — when each line appears
    minMs:      2500,                                    // minimum display before advancing
    lineFadeS:  0.4,                                     // individual line fade-in
  },

  // ── Typography — reference existing CSS design tokens ─────────────────────
  type: {
    word:  { family: 'var(--font-display)', size: 'var(--text-3xl)' }, // ReactionTest word
    label: { family: 'var(--font-display)', size: 'var(--text-2xl)' }, // Scale/Speed labels
    prompt:{ family: 'var(--font-display)', size: 'var(--text-xl)'  }, // SpeedRound prompt
    mono:  { family: 'var(--font-mono)',    size: 'var(--text-xs)'  }, // progress, hints
    hint:  { family: 'var(--font-mono)',    size: 'var(--text-xs)'  }, // drag hints
  },

  // ── Spacing — reference existing CSS design tokens ─────────────────────────
  space: {
    mobilePad:  'var(--space-8)',
    mobileGap:  'clamp(12px, 4vh, var(--space-8))', // fluid — no overflow on small phones
    desktopPad: 'var(--space-12)',
    desktopGap: 'var(--space-6)',
  },

} as const

/** True when the viewport is wider than the desktop breakpoint.
 *  Computed once at module load — safe for layout decisions. */
export const isDesktop =
  typeof window !== 'undefined' && window.innerWidth > MG.desktopBreakpoint
