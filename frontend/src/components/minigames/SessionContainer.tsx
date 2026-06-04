import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { ReactionTest } from './ReactionTest'
import { WeightedScale } from './WeightedScale'
import { PredictionDuel } from './PredictionDuel'
import { ConfirmModal } from '../ui/ConfirmModal'
import { apiFetch } from '../../lib/api'
import { copy } from '../../lib/copy'
import { SESSION_RETRY_DELAY_MS } from '../../lib/constants'
import { MG } from '../../lib/minigame'
import type { Fragment } from '../../types'

interface Props {
  fragments: Fragment[]
  onComplete: (count: number) => void
}

type Phase = 'game' | 'mood'

const MOOD_SCORES = [1, 2, 3, 4, 5]
const transMs     = MG.transition.fragmentMs

export function SessionContainer({ fragments, onComplete }: Props) {
  const navigate           = useNavigate()
  const reduced            = useReducedMotion()
  const transTimer         = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [idx, setIdx]      = useState(0)
  const [phase, setPhase]  = useState<Phase>('game')

  useEffect(() => () => clearTimeout(transTimer.current), [])
  const [visible, setVisible]         = useState(true)
  const [showExitModal, setShowExitModal] = useState(false)

  const fragment = fragments[idx]
  const progress = phase === 'mood' ? 1 : idx / fragments.length

  function postResponse(frag: Fragment, responseData: unknown) {
    const body = JSON.stringify({ fragment_id: frag.id, fragment_type: frag.type, response_data: responseData })
    const post = () => apiFetch('/session/response', { method: 'POST', body })
    post().catch(() => setTimeout(() => post().catch(() => {}), SESSION_RETRY_DELAY_MS))
  }

  function advance(currentIdx: number) {
    if (currentIdx + 1 >= fragments.length) {
      setPhase('mood')
    } else {
      setIdx(currentIdx + 1)
    }
    setVisible(true)
  }

  function handleFragmentComplete(responseData: unknown) {
    postResponse(fragment, responseData)
    if (reduced) {
      advance(idx)
      return
    }
    setVisible(false)
    transTimer.current = setTimeout(() => advance(idx), transMs)
  }

  function handleMoodSelect(score: number) {
    apiFetch('/session/mood', { method: 'POST', body: JSON.stringify({ score }) }).catch(() => {})
    onComplete(fragments.length)
  }

  function handleExit() { setShowExitModal(true) }

  function renderFragment() {
    const raw = JSON.parse(fragment.payload) as Record<string, unknown>
    switch (fragment.type) {
      case 'reaction_test':
        return <ReactionTest words={raw.words as string[]} durationMs={raw.duration_ms as number} onComplete={(r) => handleFragmentComplete(r)} />
      case 'weighted_scale':
        return <WeightedScale pairs={[{ left: raw.left as string, right: raw.right as string }]} onComplete={(r) => handleFragmentComplete(r)} />
      case 'prediction_duel':
        return <PredictionDuel pattern={raw.pattern as string} prediction={raw.prediction as string} onComplete={(r) => handleFragmentComplete(r)} />
      default:
        return null
    }
  }

  return (
    <>
      {/* Progress bar + exit — always visible, never fades */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <div style={{ height: MG.reaction.progressHeight, background: 'var(--border)', overflow: 'hidden' }}>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: progress }}
            transition={{ duration: MG.reaction.progressAnimS }}
            style={{ height: '100%', width: '100%', background: 'var(--accent)', transformOrigin: 'left' }}
          />
        </div>
        <button
          onClick={handleExit}
          style={{ position: 'absolute', top: 0, right: 0, width: 52, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>

      {/* Content — fades between fragments and on mood transition */}
      <motion.div
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : transMs / 1000, ease: 'easeInOut' }}
        style={{ position: 'fixed', inset: 0 }}
      >
        {phase === 'game' ? (
          <>
            {renderFragment()}
            {fragment.daemon_note && (
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: `var(--space-4) var(--space-6)`, paddingBottom: `calc(var(--space-4) + env(safe-area-inset-bottom))`, zIndex: 10, textAlign: 'center', pointerEvents: 'none' }}>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {fragment.daemon_note}
                </p>
              </div>
            )}
          </>
        ) : (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-8)', padding: 'var(--space-8)' }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--text-primary)', textAlign: 'center' }}>
              How do you feel right now?
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
              {MOOD_SCORES.map(score => (
                <motion.button
                  key={score}
                  onClick={() => handleMoodSelect(score)}
                  whileTap={{ scale: 0.92 }}
                  className="glass-card"
                  style={{ width: 56, height: 56, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--text-primary)', background: 'transparent' }}
                >
                  {score}
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {showExitModal && (
        <ConfirmModal
          message={copy.session.exitPrompt}
          cancelLabel={copy.session.exitCancel}
          confirmLabel={copy.session.exitConfirm}
          dangerous
          onCancel={() => setShowExitModal(false)}
          onConfirm={() => navigate('/home')}
        />
      )}
    </>
  )
}
