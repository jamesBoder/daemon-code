import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Settings as SettingsIcon } from 'lucide-react'
import { CONSOLE } from '../../lib/console'
import { CONSOLE_CONTENT_Z_INDEX, CONSOLE_FLICKER_Z_INDEX, CONSOLE_OVERLAY_Z_INDEX, HAIRLINE, HEADER_Z_INDEX, MIN_TOUCH_TARGET } from '../../lib/constants'
import { playSound } from '../../lib/sound'
import { fetchSelf } from '../../lib/api'
import { applyArchetypeAccent } from '../../lib/colors'

export type ConsoleTab = 'play' | 'self'

const TABS: { key: ConsoleTab; label: string; path: string }[] = [
  { key: 'play', label: 'PLAY', path: '/play' },
  { key: 'self', label: 'SELF', path: '/play/self' },
]

interface ConsoleShellProps {
  active:   ConsoleTab
  children: ReactNode
  // Lets a screen (e.g. Play.tsx leaving to start a session) trigger the same
  // whole-screen flicker as a tab switch. Deliberately NOT done by having the
  // screen render its own overlay — a screen's content renders inside the
  // content wrapper below, which has its own z-index and therefore its own
  // stacking context; a fixed div nested in there can never out-rank the tab
  // strip's z-index no matter what value it's given itself (found testing
  // Play.tsx's "leaving" transition, 2026-09-18). This flicker div is a
  // top-level sibling of the tab strip, so it actually covers it.
  flickering?: boolean
}

// The persistent console frame wrapping PLAY and SELF (docs/simplify-pass.md,
// "Frontend spec: shell & navigation" + "visual/design language"). Replaces
// BottomNav for these two screens with a top tab strip, Pip-Boy-literal per
// the user's chosen direction — a device you're looking INTO, not a normal
// app with tabs. New route, additive: BottomNav and every existing screen
// stay untouched until cutover.
export function ConsoleShell({ active, children, flickering = false }: ConsoleShellProps) {
  const navigate = useNavigate()
  const [flicker, setFlicker] = useState(false)

  // Archetype-driven accent color (lib/colors.ts) -- previously only wired up
  // in the old Home.tsx, silently lost when the console shell replaced it as
  // the default landing experience. Restored here (not in Play.tsx/SelfTab.tsx
  // individually) so it applies uniformly across PLAY, SELF, and Complete —
  // every screen ConsoleShell wraps — from one shared query. Reuses SelfTab's
  // own ['self'] query key/staleTime so the two share a cache entry instead
  // of double-fetching when a session visits both tabs.
  const { data: self } = useQuery({
    queryKey: ['self'],
    queryFn: fetchSelf,
    staleTime: 5 * 60 * 1000,
  })
  useEffect(() => {
    if (!self) return
    applyArchetypeAccent(self.archetype)
  }, [self?.archetype])

  function switchTab(tab: ConsoleTab, path: string) {
    if (tab === active) return
    playSound('click')
    setFlicker(true)
    navigate(path)
  }

  // Flicker is a brightness dip, not spatial motion — never reduced-motion
  // gated (see [[reduced-motion-gate]]), plays for every user.
  useEffect(() => {
    if (!flicker) return
    const t = setTimeout(() => setFlicker(false), CONSOLE.tabSwitch.flickerMs)
    return () => clearTimeout(t)
  }, [flicker])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--background)' }}>
      {/* Scanline texture — a soft repeating ripple (3-stop gradient, not a
          hard on/off line) so it reads as texture rather than a defect. Same
          layering family as the grain overlay, sits beneath the chrome so
          tab labels stay crisp. */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, pointerEvents: 'none',
          zIndex: CONSOLE_OVERLAY_Z_INDEX,
          backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, rgba(255,255,255,${CONSOLE.scanline.opacity}) ${CONSOLE.scanline.repeatPx / 2}px, transparent ${CONSOLE.scanline.repeatPx}px)`,
        }}
      />
      {/* Screen-edge vignette — a subtle center brightness lift fading
          outward, not edge-darkening (the base is already near-black, so
          darkening further is imperceptible — see lib/console.ts). */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, pointerEvents: 'none',
          zIndex: CONSOLE_OVERLAY_Z_INDEX,
          background: `radial-gradient(ellipse at center, rgba(255,255,255,${CONSOLE.vignette.glowOpacity}) 0%, transparent ${CONSOLE.vignette.reachPct}%)`,
        }}
      />
      {/* Tab-switch flicker — a brief whole-screen dip, the device-touch beat
          that pairs with the tab-switch sound. */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, pointerEvents: 'none',
          zIndex: CONSOLE_FLICKER_Z_INDEX,
          background: '#000',
          opacity: (flicker || flickering) ? CONSOLE.tabSwitch.flickerDipOpacity : 0,
          transition: `opacity ${CONSOLE.tabSwitch.flickerMs}ms ease-out`,
        }}
      />

      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          height: `calc(${CONSOLE.tabStrip.heightPx}px + env(safe-area-inset-top))`,
          paddingTop: 'env(safe-area-inset-top)',
          background: 'rgba(13, 16, 24, 0.92)',
          borderBottom: `${HAIRLINE} solid rgba(255, 255, 255, 0.07)`,
          backdropFilter: 'blur(16px) saturate(140%)',
          WebkitBackdropFilter: 'blur(16px) saturate(140%)',
          display: 'flex', alignItems: 'center',
          zIndex: HEADER_Z_INDEX,
        }}
      >
        <div style={{ flex: 1, display: 'flex', height: CONSOLE.tabStrip.heightPx }}>
          {TABS.map(({ key, label, path }) => {
            const isActive = key === active
            return (
              <button
                key={key}
                onClick={() => switchTab(key, path)}
                style={{
                  flex: '0 0 auto',
                  height: '100%',
                  padding: '0 var(--space-5)',
                  display: 'flex', alignItems: 'center',
                  position: 'relative',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: CONSOLE.tabStrip.fontSizePx,
                  letterSpacing: CONSOLE.tabStrip.letterSpacing,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  textShadow: isActive
                    ? `${CONSOLE.chromaticGlow.offsetPx}px 0 rgba(220,38,38,${CONSOLE.chromaticGlow.redA}), -${CONSOLE.chromaticGlow.offsetPx}px 0 rgba(34,211,238,${CONSOLE.chromaticGlow.cyanA})`
                    : 'none',
                  transition: 'color 0.15s',
                }}
              >
                {label}
                {isActive && (
                  <span
                    aria-hidden
                    className="console-tab-underline"
                    style={{
                      position: 'absolute', bottom: 0,
                      left: 'var(--space-5)', right: 'var(--space-5)',
                      height: CONSOLE.tabStrip.underlineHeightPx,
                      background: 'var(--accent)',
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => navigate('/settings')}
          aria-label="Settings"
          style={{
            width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)',
          }}
        >
          <SettingsIcon size={CONSOLE.settingsIcon.sizePx} strokeWidth={1.5} />
        </button>
      </div>

      {/* Real PLAY/SELF content — explicitly above the scanline/vignette
          texture (CONSOLE_OVERLAY_Z_INDEX) so interactive UI (buttons etc.)
          always renders at full clarity. Those overlays have no z-index of
          their own reason to sit above real content; without this, an
          "auto" z-index loses to their explicit one regardless of DOM
          order, which is exactly what washed out the low-contrast Begin
          button in testing (2026-09-17). */}
      <div
        style={{
          position: 'fixed',
          top: `calc(${CONSOLE.tabStrip.heightPx}px + env(safe-area-inset-top))`,
          left: 0, right: 0, bottom: 0,
          overflowY: 'auto',
          zIndex: CONSOLE_CONTENT_Z_INDEX,
        }}
      >
        {children}
      </div>
    </div>
  )
}
