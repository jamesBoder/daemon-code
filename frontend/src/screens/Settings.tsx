import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { jwtDecode } from 'jwt-decode'
import { Play } from 'lucide-react'
import { motion } from 'framer-motion'
import { DaemonButton } from '../components/ui/DaemonButton'
import { BottomNav } from '../components/ui/BottomNav'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { apiFetchJson, patchProfile, getVoiceSampleUrl } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { BOTTOM_NAV_HEIGHT, BUTTON_TAP_SCALE, BUTTON_TAP_OPACITY, HAIRLINE, HAPTICS_KEY, LETTER_SPACING_WIDE, MAX_CONTENT_WIDTH, MIN_TOUCH_TARGET, ROUTE_TRANSITION_MS, SCREEN_HEADER_HEIGHT, SOUND_KEY } from '../lib/constants'
import { playSound } from '../lib/sound'
import type { ShadowProfile } from '../types'

const TOGGLE = {
  trackW:   40,
  trackH:   24,
  radius:   12,
  dotSize:  18,
  dotPad:   3,
  hitPadV:  10,
  hitPadH:  2,
  get dotOn()  { return this.trackW - this.dotSize - this.dotPad },
  transS: `${ROUTE_TRANSITION_MS / 1000}s`,
}

function ToggleRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
        {label}
      </p>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        style={{
          padding: `${TOGGLE.hitPadV}px ${TOGGLE.hitPadH}px`,
          background: 'none', border: 'none', cursor: 'pointer',
          flexShrink: 0, lineHeight: 0,
        }}
      >
        <span style={{
          display: 'block',
          width: TOGGLE.trackW, height: TOGGLE.trackH, borderRadius: TOGGLE.radius,
          background: checked ? 'var(--accent)' : 'var(--border)',
          position: 'relative',
          transition: `background ${TOGGLE.transS}`,
        }}>
          <span style={{
            position: 'absolute',
            top: TOGGLE.dotPad, left: checked ? TOGGLE.dotOn : TOGGLE.dotPad,
            width: TOGGLE.dotSize, height: TOGGLE.dotSize, borderRadius: '50%',
            background: 'var(--text-primary)',
            display: 'block',
            transition: `left ${TOGGLE.transS}`,
          }} />
        </span>
      </button>
    </div>
  )
}

const VOICE_ANIM = {
  radioDotSize:  16,
  radioInnerSize: 6,
  transS:        '0.15s',  // faster than ROUTE_TRANSITION_MS — selection feedback, not page change
} as const

const VOICE_OPTIONS = [
  { id: null,      description: 'Daemon default'          },
  { id: 'Matthew', description: 'Measured, deliberate'    },
  { id: 'Ruth',    description: 'Warm, searching'         },
  { id: 'Stephen', description: 'Contained, harder edge'  },
  { id: 'Kendra',  description: 'Quiet, subdued'          },
  { id: 'Amy',     description: 'British, precise'        },
  { id: 'Brian',   description: 'British, slower cadence' },
]

export function Settings() {
  const navigate      = useNavigate()
  const queryClient   = useQueryClient()
  const { token, logout } = useAuthStore()

  const email = token
    ? (jwtDecode<{ email: string }>(token).email ?? '')
    : ''

  const [hapticsEnabled, setHapticsEnabled] = useState(
    () => localStorage.getItem(HAPTICS_KEY) !== 'false'
  )
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem(SOUND_KEY) === 'true'
  )
  const [previewPlaying, setPreviewPlaying] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null }, [])

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiFetchJson<ShadowProfile>('/profile'),
    staleTime: 5 * 60 * 1000,
  })

  const currentVoice = profile?.polly_voice ?? null

  function handleHapticsToggle() {
    const next = !hapticsEnabled
    localStorage.setItem(HAPTICS_KEY, String(next))
    setHapticsEnabled(next)
  }

  function handleSoundToggle() {
    const next = !soundEnabled
    localStorage.setItem(SOUND_KEY, String(next))
    setSoundEnabled(next)
    if (next) playSound('click')    // confirm it works + unlock the context within this gesture
  }

  function handleSignOut() {
    logout()
    navigate('/welcome', { replace: true })
  }

  function handleVoiceSelect(voiceId: string | null) {
    queryClient.setQueryData(['profile'], (old: ShadowProfile | undefined) =>
      old ? { ...old, polly_voice: voiceId } : old
    )
    patchProfile(voiceId).catch(() => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    })
  }

  async function handlePreview(voiceId: string) {
    if (previewLoading) return
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (previewPlaying === voiceId) {
      setPreviewPlaying(null)
      return
    }
    setPreviewLoading(voiceId)
    try {
      const url = await getVoiceSampleUrl(voiceId)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setPreviewPlaying(null); audioRef.current = null }
      await audio.play()
      setPreviewPlaying(voiceId)
    } catch {
      // Silent fail
    } finally {
      setPreviewLoading(null)
    }
  }

  return (
    <>
      <ScreenHeader title="settings" />
      <div className="screen" style={{ overflowY: 'auto', paddingTop: `calc(${SCREEN_HEADER_HEIGHT}px + env(safe-area-inset-top))`, paddingBottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))` }}>
        <div style={{ padding: 'var(--space-6) var(--space-5) var(--space-8)', maxWidth: MAX_CONTENT_WIDTH, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

          <div className="glass-card" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE, textTransform: 'uppercase' }}>
              Account
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              {email}
            </p>
            <DaemonButton
              variant="secondary"
              onClick={handleSignOut}
              style={{ color: 'var(--warning)', borderColor: 'var(--warning)' }}
            >
              Sign out
            </DaemonButton>
          </div>

          {/* Daemon Voice */}
          <div className="glass-card" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE, textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>
                Daemon Voice
              </p>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
                The daemon selects by default. You can override here.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {VOICE_OPTIONS.map(({ id, description }) => {
                const isSelected = id === null ? currentVoice === null : currentVoice === id
                return (
                  <div
                    key={id ?? '__default'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--space-4)',
                      padding: 'var(--space-3) var(--space-1)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {/* Radio + label */}
                    <button
                      onClick={() => handleVoiceSelect(id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                        flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                        padding: 0, minHeight: MIN_TOUCH_TARGET, textAlign: 'left',
                      }}
                    >
                      <span style={{
                        width: VOICE_ANIM.radioDotSize, height: VOICE_ANIM.radioDotSize, borderRadius: '50%', flexShrink: 0,
                        border: `${HAIRLINE} solid ${isSelected ? 'var(--accent)' : 'var(--border-active)'}`,
                        background: isSelected ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: `background ${VOICE_ANIM.transS}, border-color ${VOICE_ANIM.transS}`,
                      }}>
                        {isSelected && (
                          <span style={{ width: VOICE_ANIM.radioInnerSize, height: VOICE_ANIM.radioInnerSize, borderRadius: '50%', background: 'var(--background)' }} />
                        )}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 'var(--text-sm)',
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                        transition: `color ${VOICE_ANIM.transS}`,
                      }}>
                        {description}
                      </span>
                    </button>

                    {id !== null ? (
                      <motion.button
                        aria-label={`Preview ${description}`}
                        onClick={() => handlePreview(id)}
                        whileTap={previewLoading ? {} : { scale: BUTTON_TAP_SCALE, opacity: BUTTON_TAP_OPACITY }}
                        style={{
                          width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: '50%', flexShrink: 0,
                          border: `${HAIRLINE} solid ${previewPlaying === id ? 'var(--accent)' : 'var(--border)'}`,
                          background: previewPlaying === id ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'none',
                          cursor: previewLoading === id ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: previewPlaying === id ? 'var(--accent)' : 'var(--text-muted)',
                          opacity: previewLoading === id ? 0.4 : 1,
                          transition: `border-color ${VOICE_ANIM.transS}, background ${VOICE_ANIM.transS}, color ${VOICE_ANIM.transS}`,
                        }}
                      >
                        <Play size={14} strokeWidth={1.5} />
                      </motion.button>
                    ) : (
                      <div style={{ width: MIN_TOUCH_TARGET, flexShrink: 0 }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* daemon.log — reference codex */}
          <Link
            to="/codex"
            className="glass-card"
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        'var(--space-4) var(--space-5)',
              textDecoration: 'none',
              minHeight:      MIN_TOUCH_TARGET,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span style={{
                fontFamily:    'var(--font-mono)',
                fontSize:      'var(--text-xs)',
                color:         'var(--compile-green)',
                letterSpacing: LETTER_SPACING_WIDE,
              }}>
                daemon.log
              </span>
              <span style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--text-muted)',
              }}>
                system reference
              </span>
            </div>
            <span style={{
              fontFamily:    'var(--font-mono)',
              fontSize:      'var(--text-xs)',
              color:         'var(--text-muted)',
              letterSpacing: LETTER_SPACING_WIDE,
            }}>
              →
            </span>
          </Link>

          {/* Preferences */}
          <div className="glass-card" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE, textTransform: 'uppercase' }}>
              Preferences
            </p>
            <ToggleRow label="Haptic feedback" checked={hapticsEnabled} onToggle={handleHapticsToggle} />
            <ToggleRow label="Daemon sounds" checked={soundEnabled} onToggle={handleSoundToggle} />
          </div>
        </div>
      </div>

      <BottomNav />
    </>
  )
}
