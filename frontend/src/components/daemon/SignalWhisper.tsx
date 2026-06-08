import { AnimatePresence, motion } from 'framer-motion'
import { useSignalHint } from '../../hooks/useSignalHint'
import { LETTER_SPACING_TIGHT, SIGNAL_WHISPER_FADE_MS } from '../../lib/constants'

const fadeSec = SIGNAL_WHISPER_FADE_MS / 1000

interface SignalWhisperProps {
  hintKey:    string
  text:       string
  condition?: boolean
}

// Ghost text that appears once, lingers SIGNAL_WHISPER_DISPLAY_MS, then dissolves.
// Daemon-voiced. Inline in document flow — caller controls positioning.
export function SignalWhisper({ hintKey, text, condition = true }: SignalWhisperProps) {
  const { shouldShow } = useSignalHint(hintKey, condition)

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: fadeSec, ease: 'easeInOut' }}
          style={{
            fontFamily:    'var(--font-display)',
            fontSize:      'var(--text-xs)',
            lineHeight:    'var(--leading-sm)',
            color:         'var(--text-muted)',
            fontStyle:     'italic',
            letterSpacing: LETTER_SPACING_TIGHT,
            pointerEvents: 'none',
            margin:        0,
          }}
        >
          {text}
        </motion.p>
      )}
    </AnimatePresence>
  )
}
