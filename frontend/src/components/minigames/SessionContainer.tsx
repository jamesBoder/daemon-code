import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { SignalWhisper } from '../daemon/SignalWhisper'
import { fragmentRegistry } from './registry'
import { MoodCheck } from './MoodCheck'
import { ConfirmModal } from '../ui/ConfirmModal'
import { apiFetch } from '../../lib/api'
import { copy } from '../../lib/copy'
import { FRAGMENT_CONTEXT_MS, FRAGMENT_HINTS_KEY, LETTER_SPACING_COMPILE, SESSION_PROGRESS_Z_INDEX, SESSION_RETRY_DELAY_MS } from '../../lib/constants'
import { MG } from '../../lib/minigame'
import type { Fragment } from '../../types'

interface Props {
  fragments: Fragment[]
  onComplete: (count: number) => void
}

type Phase = 'game' | 'mood'

const transMs = MG.transition.fragmentMs

export function SessionContainer({ fragments, onComplete }: Props) {
  const navigate  = useNavigate()
  const reduced   = useReducedMotion()
  const transTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Forward-compat: a deck from a newer backend may carry fragment types this
  // client can't render yet — drop them instead of blanking mid-session.
  const playable  = fragments.filter(f => f.type in fragmentRegistry)
  const [idx, setIdx]     = useState(0)
  const [phase, setPhase] = useState<Phase>(playable.length > 0 ? 'game' : 'mood')
  const [visible, setVisible] = useState(true)

  // Layer 4 — Fragment Context Lines: show a mono context line for FRAGMENT_CONTEXT_MS
  // before each new fragment type to orient the user. Tracked per type in localStorage.
  const seenFragmentTypes = useRef<Set<string>>(
    new Set(JSON.parse(localStorage.getItem(FRAGMENT_HINTS_KEY) ?? '[]') as string[])
  )

  function checkAndMarkFragmentType(type: string): boolean {
    if (seenFragmentTypes.current.has(type)) return false
    seenFragmentTypes.current.add(type)
    localStorage.setItem(FRAGMENT_HINTS_KEY, JSON.stringify([...seenFragmentTypes.current]))
    return true
  }

  const [contextShowing, setContextShowing] = useState(() =>
    playable[0] ? checkAndMarkFragmentType(playable[0].type) : false
  )

  useEffect(() => {
    if (!contextShowing) return
    const t = setTimeout(() => setContextShowing(false), FRAGMENT_CONTEXT_MS)
    return () => clearTimeout(t)
  }, [contextShowing])

  useEffect(() => () => clearTimeout(transTimer.current), [])

  // Exit guard — useBlocker requires a data router; this popstate approach works with BrowserRouter.
  // On mount we push a duplicate history entry so the device back gesture fires popstate instead
  // of immediately navigating away. The handler re-pushes the entry and shows the confirm modal.
  const [showExitModal, setShowExitModal] = useState(false)

  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    function handlePopState() {
      window.history.pushState(null, '', window.location.href)
      setShowExitModal(true)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const fragment = playable[idx]
  const progress = phase === 'mood' ? 1 : idx / playable.length

  // In-flight response posts. The session-complete scorer reads today's responses
  // straight from the DB, so they must be persisted before onComplete fires —
  // otherwise the live process movement is computed on stale data.
  const pendingPosts = useRef<Promise<unknown>[]>([])

  function postResponse(frag: Fragment, responseData: unknown) {
    const body = JSON.stringify({ fragment_id: frag.id, fragment_type: frag.type, response_data: responseData })
    const post = () => apiFetch('/session/response', { method: 'POST', body })
    // Resolve only once the response (or its single retry) has settled, so the
    // completion handler can await all posts before scoring.
    const settled = post().catch(
      () => new Promise<void>(resolve => {
        setTimeout(() => post().catch(() => {}).finally(() => resolve()), SESSION_RETRY_DELAY_MS)
      })
    )
    pendingPosts.current.push(settled)
  }

  function advance(currentIdx: number) {
    if (currentIdx + 1 >= playable.length) {
      setPhase('mood')
    } else {
      const needsContext = checkAndMarkFragmentType(playable[currentIdx + 1].type)
      setContextShowing(needsContext)
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

  async function handleMoodSelect(score: number) {
    apiFetch('/session/mood', { method: 'POST', body: JSON.stringify({ score }) }).catch(() => {})
    // Wait for every card response to land before completing, so the live scorer
    // sees the full session. Best-effort: allSettled never rejects.
    await Promise.allSettled(pendingPosts.current)
    onComplete(playable.length)
  }

  // Playable fragments always have a registry entry; rendered as a keyed JSX
  // component so each fragment mounts fresh.
  const Renderer = phase === 'game' && fragment ? fragmentRegistry[fragment.type] : null

  return (
    <>
      {/* Progress bar + exit — always visible, never fades */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: SESSION_PROGRESS_Z_INDEX, paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={{ height: MG.reaction.progressHeight, background: 'var(--border)', overflow: 'hidden' }}>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: progress }}
            transition={{ duration: MG.reaction.progressAnimS }}
            style={{ height: '100%', width: '100%', background: 'var(--accent)', transformOrigin: 'left' }}
          />
        </div>
        <button
          onClick={() => setShowExitModal(true)}
          style={{ position: 'absolute', top: 'env(safe-area-inset-top)', right: 0, width: MG.session.closeW, height: MG.session.closeH, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={MG.session.closeIconSize} strokeWidth={MG.session.closeStroke} />
        </button>
      </div>

      {/* Content — fades between fragments and on mood transition */}
      <motion.div
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : transMs / 1000, ease: 'easeInOut' }}
        style={{ position: 'fixed', inset: 0 }}
      >
        {phase === 'game' ? (
          contextShowing ? (
            // Layer 4: new fragment type — show a context line for FRAGMENT_CONTEXT_MS before game starts
            <div style={{
              position:       'fixed', inset: 0,
              display:        'flex', flexDirection: 'column',
              alignItems:     'center', justifyContent: 'center',
              gap:            'var(--space-4)',
              padding:        'var(--space-8)',
              pointerEvents:  'none',
            }}>
              <p style={{
                fontFamily:    'var(--font-mono)',
                fontSize:      'var(--text-mono)',
                color:         'var(--compile-green)',
                letterSpacing: LETTER_SPACING_COMPILE,
                textAlign:     'center',
              }}>
                {copy.fragmentContext[fragment.type] ?? ''}
              </p>
            </div>
          ) : (
            <>
              {/* Layer 1: fires once on first fragment ever (any type) */}
              <SignalWhisper
                hintKey="session_fragment"
                text={copy.signalHints.session_fragment}
              />
              {Renderer && (
                <Renderer
                  key={fragment.id}
                  fragment={fragment}
                  raw={JSON.parse(fragment.payload) as Record<string, unknown>}
                  onComplete={handleFragmentComplete}
                />
              )}
              {fragment.daemon_note && (
                <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: `var(--space-4) var(--space-6)`, paddingBottom: `calc(var(--space-4) + env(safe-area-inset-bottom))`, zIndex: SESSION_PROGRESS_Z_INDEX, textAlign: 'center', pointerEvents: 'none' }}>
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {fragment.daemon_note}
                  </p>
                </div>
              )}
            </>
          )
        ) : (
          <MoodCheck onSelect={handleMoodSelect} />
        )}
      </motion.div>

      {showExitModal && (
        <ConfirmModal
          message={copy.session.exitPrompt}
          cancelLabel={copy.session.exitCancel}
          confirmLabel={copy.session.exitConfirm}
          dangerous
          onCancel={() => setShowExitModal(false)}
          onConfirm={() => navigate('/home', { replace: true })}
        />
      )}
    </>
  )
}
