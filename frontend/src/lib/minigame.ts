/**
 * Central design config for all mini-game components.
 * Change values here — components contain no magic numbers.
 */
export const MG = {

  // ── Responsive breakpoint ──────────────────────────────────────────────────
  desktopBreakpoint: 768,

  // ── Shared drag track (WeightedScale, MoodCheck + any future draggable game) ──
  track: {
    height:          52,    // px — total row height
    handleSize:      28,    // px — diameter of the draggable circle
    handleScale:     1.2,   // whileDrag scale multiplier
    handleBorderW:   1.5,   // px — handle circle border width
    dragElastic:     0.05,  // Framer Motion dragElastic
    edgeInset:       16,    // px — gap between handle edge and track end
    confirmMaxW:     200,   // px — confirm button max width below the track
    dragMaxFallback: 120,   // px — half-track guess before useLayoutEffect measures
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
    recordMin:     1,    // daemon record domain bounds — mirror analyst 1-100 rule
    recordMax:     100,
    recordTick:    1,    // visual record movement on reveal
  },

  // ── Transitions — component-to-component and state-to-state ───────────────
  transition: {
    fragmentMs: 220,  // fade between session fragments
    pairMs:     150,  // fade between scale pairs
    promptMs:    80,  // speed round prompt crossfade (matches speed.crossfadeMs)
    stepMs:     250,  // onboarding step transitions
    revealS:    0.25, // generic reveal fade (confirm buttons, etc.)
  },

  // ── Session chrome (progress bar + exit button) ────────────────────────────
  session: {
    closeW:        52,   // px — wider than 44 to clear safe-area edge
    closeH:        44,   // px — = MIN_TOUCH_TARGET
    closeIconSize: 18,
    closeStroke:   1.5,
  },

  // ── MoodCheck (end-of-session spectrum) ────────────────────────────────────
  mood: {
    orbSize:        140,  // px — DaemonOrb diameter above the spectrum
    trackMaxW:      360,  // px — spectrum track max width
    ackMaxW:        300,  // px — acknowledgement line text column width
    dragMaxFallback: 120, // px — half-track guess before useLayoutEffect measures
    ackHoldMs:     1400,  // how long the acknowledgement line shows before navigating
    scoreMin:         1,  // mood score domain — matches /session/mood contract
    scoreMax:         5,
  },

  // ── The Trap (the one game with a right answer) ───────────────────────────
  trap: {
    maxW:          360,    // px — tableau column max width
    terminalGap:   'var(--space-3)', // between the two decision terminals
    terminalMinH:  132,    // px — tall tap target, well above MIN_TOUCH_TARGET
    oddsBarH:      6,      // px — probability split bar height
    oddsBarFillS:  0.5,    // s  — left-to-right fill (motion only)
    meterH:        8,      // px — locked "sunk" meter height
    meterOpacity:  0.4,    // the sunk meter reads inert — it's already spent
    commitFlashMs: 150,    // chosen terminal amber flash-in
    loggedHoldMs:  900,    // "logged." dwell before advancing
    loggedFadeS:   0.3,    // logged-beat fade timing
    dimAlpha:      0.35,   // opacity of the unchosen terminal after commit
    frame:        'var(--warning)',       // the Trap's identity color (amber)
    oddsGain:     'var(--compile-green)', // upside slice of the odds bar
    oddsLoss:     'var(--warning)',       // downside slice of the odds bar
  },

  // ── The Stroop Variant (content vs. context — full-liberty dissonance) ────
  // Own identity: each word's meaning fights its styling. Threat styling must
  // actually menace (aggressive red, jagged, glowing, vibrating); calm styling
  // must read serene (soft blue, light, wide, still). The contrast is the game.
  stroop: {
    maxW:        360,    // px — column max width
    wordFamily:  'var(--font-display)',
    wordSize:    'clamp(56px, 18vw, 88px)', // bigger than any other fragment word
    wordSizeLong: 'clamp(36px, 11vw, 60px)', // long words (decorative fonts overflow otherwise)
    longWordLen:  7,                          // >this many chars → use wordSizeLong
    trialCapMs:  2600,   // soft cap per trial; no response → recorded as 'none'
    advanceMs:   500,    // beat after an answer before the next trial (was a blur at 240)
    buttonMinH:  56,     // px — well above MIN_TOUCH_TARGET
    buttonGap:   'var(--space-3)',

    // Threat styling — aggressive, unstable, alarming
    threatColor:        '#ff2424',   // hard alarm red (not the friendly rose)
    threatWeight:       800,
    threatLetterSpacing: '-0.03em',  // cramped, tense
    threatSkewDeg:      -7,          // jagged tilt
    threatShadowHard:   '#6b0000',   // hard dark-red offset (sharp, not soft)
    threatShadowOffset: 2,           // px — offset of the hard shadow
    threatGlow:         'rgba(255,40,40,0.45)', // alarm halo
    threatGlowBlur:     22,          // px
    vibrateAmp:         3,           // px — jitter amplitude (motion only)
    vibrateRotateDeg:   0.8,         // deg — adds instability to the jitter
    vibrateDurS:        0.13,        // s  — fast = nervous

    threatFont:         "'Anton', var(--font-display)",  // heavy condensed — loud (per-item font can override)

    // Calm styling — serene, weightless, still
    calmColor:          '#5db8ff',   // soft cool blue
    calmWeight:         300,
    calmLetterSpacing:  '0.18em',    // airy
    calmGlow:           'rgba(56,189,248,0.30)', // gentle halo
    calmGlowBlur:       26,          // px
    calmFont:           "'Cormorant', var(--font-display)", // light elegant serif

    // Word transition + stage. Directional entrances — far more perceptible than
    // scale/blur in a fast game: threat words DROP IN HARD from above and bounce;
    // calm words RISE gently up from below. Opposite directions, opposite feels.
    stageH:      168,    // px — fixed word-stage height (keeps buttons from jumping)
    threatEnter: { y: -54, scale: 1.10, durS: 0.26, ease: 'backOut' }, // slams down from above, lands with a bounce
    calmEnter:   { y: 36,  scale: 1.00, durS: 0.60, ease: 'easeOut' }, // floats up from below, slow
    exitScale:   0.96,   // outgoing word shrinks slightly as it fades

    // Escalation feedback
    advancePressureCut: 0.5,          // advance beat shortens up to this fraction at full pressure
    progressHigh:       'var(--warning)', // progress bar reddens as pressure climbs
    dimmedAlpha:        0.4,          // the unchosen pole dims after a pick (a "logged" beat)

    // Response poles rotate across the session and are carried per-item (each
    // trial's axis defines its own two poles); only their position is randomized.

    // Neutral channel — when a trial's `cue` turns a channel OFF, that channel
    // falls back to neutral so the threat/calm pressure can be delivered through
    // color OR type OR motion alone (§5e #2 — move the distractor so "go by the
    // look" never stabilizes).
    neutralColor:         'var(--text-primary)',
    neutralFont:          'var(--font-display)',
    neutralWeight:        500,
    neutralLetterSpacing: 'normal',

    // Reactive atmosphere — a register-tinted vignette behind the word so the
    // emotional pressure is environmental, not just on the glyph. It also
    // intensifies with adaptive pressure (the daemon leaning in).
    atmThreat:   'rgba(255,36,36,0.16)', // red edge-bleed on threat trials
    atmCalm:     'rgba(56,189,248,0.10)',// cool wash on calm trials
    atmNeutral:  'rgba(0,0,0,0)',        // no tint when the cue isn't color
    atmInsetPct: 38,                     // % — transparent core before the tint ramps in
    atmTransS:   0.85,                   // s — slow crossfade (the register flips felt too sudden)
    atmBaseOpacity: 0.55,                // vignette strength at pressure 0 (→ 1.0 at full pressure)
    // Pressure "tunnel" — the screen edges darken as the daemon leans in. A clear,
    // central escalation cue (the thin progress bar alone was too easy to miss).
    atmTunnel:        'rgba(0,0,0,0.7)',
    tunnelInsetPct:   26,                // % — transparent core; edges darken beyond it
    tunnelMaxOpacity: 0.65,              // darkening at full pressure

    // Adaptive opposition (§5e #4) — the daemon pushes back when you cruise. Fast,
    // consistent answers raise "pressure"; pressure tightens the soft cap (less
    // time to think) and intensifies the atmosphere. Slow answers / timeouts ease
    // it off. The game gets harder the more in control you seem.
    trialCapMinMs: 1400,  // soft cap at full pressure (vs trialCapMs at zero)
    fastRtMs:      900,   // an answer under this reads as confident/auto-pilot
    settleStreak:  2,     // settle sooner → pressure is reachable in a normal run
    pressureBase:  0.05,  // every answered trial creeps pressure up (an escalation arc)
    pressureStep:  0.14,  // bonus per fast answer / per settling event
    pressureDecay: 0.12,  // pressure shed on a timeout

    // Counter-strategy (§5e #4 v2) — the daemon reads HOW you play and counters it.
    counterWindow:   4,    // recent answered trials assessed for a tendency
    counterHighRate: 0.75, // ≥ this follow-meaning rate (you ignore the look) → escalate the distractor (force 'all')
    counterLowRate:  0.25, // ≤ this (the look rules you) → strip the distractor, force an actual read

    // Threat-slam impact — a tiny screen jolt on a threat entrance, only at high
    // pressure (sparing + reinforces escalation).
    shakePressure: 0.55,  // min pressure before a threat slam shakes the screen
    shakeAmp:      7,     // px
    shakeDurS:     0.22,  // s

    // Grain — the noise overlay (body::after) intensifies as pressure climbs.
    grainRest:  0.025,    // resting opacity (matches index.css default)
    grainBoost: 0.08,     // added at full pressure → ~0.105

    // Select confirm — the chosen pole fills + pops
    selectPopScale: 1.05,
    selectFillText: 'var(--background)',

    flashMs:     140,    // chosen-button accent flash
    progressHeight: 2,   // px — bottom progress bar
    progressAnimS: 0.15, // s — progress fill width animation
    tunnelTransS:  0.3,  // s — pressure-tunnel opacity ramp
    selectPopS:    0.12, // s — chosen-pole pop
    tapScale:      0.97, // whileTap scale on a pole button
    wordMaxVw:     '94vw', // word never exceeds this width
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
