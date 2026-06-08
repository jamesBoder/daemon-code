import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { copy } from '../lib/copy'
import { HAIRLINE, LETTER_SPACING_COMPILE, MIN_TOUCH_TARGET, SCREEN_HEADER_HEIGHT } from '../lib/constants'

const CODEX = {
  lineGap:      2,   // px — tight mono spacing within an entry
  animDurationS: 0.18,
} as const

export function Codex() {
  const navigate = useNavigate()
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())

  function toggle(key: string) {
    setOpenKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }

  return (
    <>
      <ScreenHeader title="daemon.log" onBack={() => navigate('/settings')} />
      <div
        className="screen"
        style={{
          overflowY:     'auto',
          paddingTop:    `calc(${SCREEN_HEADER_HEIGHT}px + env(safe-area-inset-top))`,
          paddingBottom: 'calc(var(--space-12) + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ padding: 'var(--space-4) var(--space-5)' }}>
          {copy.codex.map((entry) => {
            const isOpen = openKeys.has(entry.key)
            return (
              <div key={entry.key}>
                {/* Collapsible header — tap to expand/collapse */}
                <button
                  onClick={() => toggle(entry.key)}
                  style={{
                    display:       'flex',
                    alignItems:    'center',
                    gap:           'var(--space-3)',
                    background:    'none',
                    border:        'none',
                    cursor:        'pointer',
                    padding:       'var(--space-1) 0',
                    minHeight:     MIN_TOUCH_TARGET,
                    width:         '100%',
                    textAlign:     'left',
                  }}
                >
                  <span style={{
                    fontFamily:    'var(--font-mono)',
                    fontSize:      'var(--text-mono)',
                    color:         isOpen ? 'var(--text-muted)' : 'var(--border-active)',
                    letterSpacing: LETTER_SPACING_COMPILE,
                    width:         '1ch',
                    flexShrink:    0,
                    userSelect:    'none',
                  }}>
                    {isOpen ? '−' : '+'}
                  </span>
                  <span style={{
                    fontFamily:    'var(--font-mono)',
                    fontSize:      'var(--text-mono)',
                    color:         'var(--compile-green)',
                    letterSpacing: LETTER_SPACING_COMPILE,
                  }}>
                    [{entry.key}]
                  </span>
                </button>

                {/* Expandable content */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: CODEX.animDurationS, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        display:        'flex',
                        flexDirection:  'column',
                        gap:            CODEX.lineGap,
                        paddingLeft:    'calc(1ch + var(--space-3))',
                        paddingBottom:  'var(--space-3)',
                      }}>
                        {entry.lines.map((line, i) => (
                          <p key={i} style={{
                            fontFamily:    'var(--font-mono)',
                            fontSize:      'var(--text-mono)',
                            color:         'var(--text-secondary)',
                            letterSpacing: LETTER_SPACING_COMPILE,
                            lineHeight:    'var(--leading-mono)',
                            margin:        0,
                          }}>
                            {line}
                          </p>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div style={{ height: HAIRLINE, background: 'var(--border)' }} />
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
