// The Console shell (docs/simplify-pass.md, "Frontend spec: shell & navigation")
// — the persistent Pip-Boy-style frame wrapping PLAY and SELF. Every tunable
// value for its CRT/device treatment lives here, matching the MG.<game> /
// PORTRAIT / CARD config-object pattern used throughout the app.
export const CONSOLE = {
  tabStrip: {
    heightPx: 52,          // the top tab-strip row, below the safe-area inset
    fontSizePx: 13,
    letterSpacing: '0.14em',
    underlineHeightPx: 2,
  },
  settingsIcon: {
    sizePx: 18,             // hit area uses the shared MIN_TOUCH_TARGET constant, not duplicated here
  },
  scanline: {
    opacity: 0.05,          // faint — texture, not a visible pattern
    repeatPx: 3,            // scanline pitch
  },
  vignette: {
    opacity: 0.55,          // edge darkening strength
    reachPct: 65,           // % of the frame the radial gradient covers before fading
  },
  tabSwitch: {
    flickerMs: 110,         // brief dip-then-recover on tab change
    flickerDipOpacity: 0.55,
  },
  chromaticGlow: {
    offsetPx: 1,            // red/cyan channel offset on the active tab label
    redA: 0.55,
    cyanA: 0.55,
  },
} as const
