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

// Token refresh
export const TOKEN_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000  // refresh if expiry < 24h away

// Push notifications
export const PUSH_PROMPT_DAY_THRESHOLD = 3          // show prompt after this many compiles
export const PUSH_PROMPT_DELAY_MS      = 8000       // delay past compile animation
export const PUSH_PROMPT_KEY           = 'push_prompt_shown'

// Page transitions
export const ROUTE_TRANSITION_MS = 200  // ms — major context changes only

// Shared element
export const ORB_LAYOUT_ID = 'daemon-orb'

// UI
export const TOAST_DISMISS_MS  = 3000  // ms — inline error auto-dismiss
export const MODAL_Z_INDEX     = 100   // above all position:fixed session content
export const MODAL_MAX_WIDTH   = 320   // px — confirm modal max width

// Session
export const SESSION_RETRY_DELAY_MS = 2000  // ms — POST retry on first network failure

// Haptics
export const HAPTICS_KEY = 'haptics_enabled'  // localStorage boolean; default true (opt-out)

// Touch targets
export const MIN_TOUCH_TARGET = 44  // px — Apple HIG minimum tappable dimension

// Layout geometry
export const BOTTOM_NAV_HEIGHT    = 80        // px — BottomNav height; used in safe-area calc across all screens
export const SCREEN_HEADER_HEIGHT = 48        // px — fixed top header height; used in safe-area calc across all tabs
export const HAIRLINE             = '0.5px'   // hairline border thickness (retina only)

// Typography
export const LETTER_SPACING_WIDE  = '0.06em'   // mono metadata labels throughout the app
export const LETTER_SPACING_TIGHT = '-0.01em'  // display prose text throughout the app

// Button interaction
export const BUTTON_TAP_SCALE   = 0.88  // whileTap scale for interactive buttons
export const BUTTON_TAP_OPACITY = 0.7   // whileTap opacity for interactive buttons

// Naming Ceremony
export const NAMING_CEREMONY_HOLD_MS = 3200   // ms each name stays on screen before auto-advance
export const NAMING_CEREMONY_EXIT_MS = 350    // ms for full overlay fade-out after last name

// Streak framing thresholds
export const STREAK_MIN_DAYS        = 2  // min consecutive days before "watching for N days" appears
export const STREAK_ABSENCE_MIN_DAY = 3  // min compile day before absence copy fires
