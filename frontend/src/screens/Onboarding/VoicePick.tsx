import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import { getOnboardingVoiceSampleUrl, patchProfile } from '../../lib/api'
import { BUTTON_TAP_SCALE, BUTTON_TAP_OPACITY, HAIRLINE, LETTER_SPACING_WIDE, MIN_TOUCH_TARGET, PROSE_MAX_WIDTH } from '../../lib/constants'

const ANIM = {
  playButtonSize: 64,
  questionMaxWidth: 280,
} as const

// The three voices presented as I / II / III — order matches archetype spread.
// Voice names are never shown to the user.
const VOICES = [
  { label: 'I',   voice: 'matthew' },
  { label: 'II',  voice: 'ruth'    },
  { label: 'III', voice: 'stephen' },
]

const VOICE_MAP: Record<string, string> = {
  matthew: 'Matthew',
  ruth:    'Ruth',
  stephen: 'Stephen',
}

interface VoicePickProps {
  onComplete: () => void
}

export function VoicePick({ onComplete }: VoicePickProps) {
  const [playing, setPlaying] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const audioRef              = useRef<HTMLAudioElement | null>(null)
  const didSelect             = useRef(false)

  async function handlePlay(voice: string) {
    if (loading) return
    // Stop current audio if already playing something
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (playing === voice) {
      setPlaying(null)
      return
    }
    setLoading(voice)
    try {
      const url = await getOnboardingVoiceSampleUrl(voice)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setPlaying(null); audioRef.current = null }
      await audio.play()
      setPlaying(voice)
    } catch {
      // Silent fail — user can still select without hearing
    } finally {
      setLoading(null)
    }
  }

  async function handleSelect(voice: string) {
    if (didSelect.current) return
    didSelect.current = true
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlaying(null)
    // Fire and forget — don't block onboarding progress on a PATCH failure
    patchProfile(VOICE_MAP[voice]).catch(() => {})
    onComplete()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-8)',
      gap: 'var(--space-10)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', textAlign: 'center', maxWidth: PROSE_MAX_WIDTH }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          lineHeight: 'var(--leading-xl)',
          fontWeight: 300,
          color: 'var(--text-primary)',
          margin: 0,
        }}>
          the daemon wants to know something.
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          letterSpacing: LETTER_SPACING_WIDE,
          margin: 0,
        }}>
          three voices. one paragraph. same words.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-5)' }}>
        {VOICES.map(({ label, voice }) => (
          <div key={voice} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
            {/* Play button */}
            <motion.button
              onClick={() => handlePlay(voice)}
              whileTap={loading ? {} : { scale: BUTTON_TAP_SCALE, opacity: BUTTON_TAP_OPACITY }}
              style={{
                width: ANIM.playButtonSize, height: ANIM.playButtonSize,
                borderRadius: '50%',
                border: `${HAIRLINE} solid ${playing === voice ? 'var(--accent)' : 'var(--border-active)'}`,
                background: playing === voice ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface)',
                cursor: loading === voice ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: playing === voice ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'border-color 0.15s, background 0.15s, color 0.15s',
                opacity: loading === voice ? 0.5 : 1,
              }}
            >
              <Play size={20} strokeWidth={1.5} />
            </motion.button>

            {/* Selection button */}
            <motion.button
              onClick={() => handleSelect(voice)}
              whileTap={{ scale: BUTTON_TAP_SCALE, opacity: BUTTON_TAP_OPACITY }}
              style={{
                minWidth: MIN_TOUCH_TARGET,
                minHeight: MIN_TOUCH_TARGET,
                padding: 'var(--space-2) var(--space-5)',
                background: 'none',
                border: `${HAIRLINE} solid var(--border)`,
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-mono)',
                color: 'var(--text-secondary)',
                letterSpacing: LETTER_SPACING_WIDE,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {label}
            </motion.button>
          </div>
        ))}
      </div>

      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'var(--text-base)',
        lineHeight: 'var(--leading-base)',
        fontWeight: 300,
        color: 'var(--text-secondary)',
        textAlign: 'center',
        maxWidth: ANIM.questionMaxWidth,
        margin: 0,
      }}>
        which one sounds like it knows you?
      </p>
    </div>
  )
}
