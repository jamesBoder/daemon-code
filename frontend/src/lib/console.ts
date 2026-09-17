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
    // A soft repeating brightness ripple, not hard on/off lines — the earlier
    // 1px-hard-edge version read as a burned-in defect rather than texture
    // (real feedback, 2026-09-17). Wider pitch + a smooth 3-stop gradient
    // instead of sharp stops.
    opacity: 0.035,
    repeatPx: 6,
  },
  vignette: {
    // The base (#070809) is already near-black — darkening edges further is
    // imperceptible, there's no headroom (real feedback: "hard to see any
    // darkening"). Lift the CENTER slightly instead and let it fade to
    // nothing outward — that's what actually reads as a vignette against a
    // near-black scene.
    glowOpacity: 0.05,
    reachPct: 70,           // % of the frame the center glow extends before fading to nothing
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
