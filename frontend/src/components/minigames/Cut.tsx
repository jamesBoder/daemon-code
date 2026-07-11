import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { MG } from '../../lib/minigame'
import { copy } from '../../lib/copy'
import { seededRandom } from '../../lib/portrait'
import { playSound } from '../../lib/sound'
import { haptic } from '../../lib/haptics'
import { MIN_TOUCH_TARGET } from '../../lib/constants'

// The Cut — Severance (features-horizon.md §5b/§5d). A fixed keep-budget
// against a field of obliquely-labelled things: cut until only the budget
// remains. Value hierarchy under FORCED LOSS — sharper than the Weighted
// Scale's pairwise, which never makes you pay for anything — plus
// temporal_focus (the weakest-read dimension) through what gets sacrificed:
// buildCut samples the field evenly across past/future/neutral items.
//
// HIGH-liberty design: the only fragment that destroys anything. Cutting is a
// press-and-HOLD (a real, recorded act — an aborted tear is itself signal, not
// a fat-finger tap) and the cut thing dissolves into the house grain, the
// inverse of The Hold (which the void clears WITH stillness; here tearing ADDS
// to it). Red (--archetype-rage) is Cut's claimed accent — no other fragment
// uses it.
//
// THE UNSOLVABLE GAME (§5e): items carry no virtue label a player could curate
// toward ("honesty", "family") — every phrase is oblique. And the field can't
// be stared at forever: past idleSmolderMs it visibly tenses, and past
// idleAutoCutMs the daemon cuts one FOR the user — indecision recorded as a
// decision, distinguishable in response_data from a chosen cut.

const C = MG.cut

interface CutItemData { id: string; text: string; temporal: string }
interface CutRecord { id: string; temporal: string; order: number; ms: number; chosen_after_ms: number; auto: boolean }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def)

// A handful of oblique things for the dev harness / an older or empty deck —
// buildCut on the real backend samples 9 (3 past + 3 future + 3 neutral) from
// a much larger pool; this is just enough to render a playable field.
const FALLBACK_ITEMS: CutItemData[] = [
  { id: 'fb_past_1',    text: 'the version of you from last year', temporal: 'past' },
  { id: 'fb_future_1',  text: 'the day this gets easier',           temporal: 'future' },
  { id: 'fb_neutral_1', text: 'the habit that keeps you safe',      temporal: 'neutral' },
  { id: 'fb_past_2',    text: 'who you were before this',           temporal: 'past' },
  { id: 'fb_future_2',  text: "someone you haven't met yet",        temporal: 'future' },
  { id: 'fb_neutral_2', text: 'the story you tell about yourself',  temporal: 'neutral' },
  { id: 'fb_past_3',    text: 'the last time it was easy',          temporal: 'past' },
  { id: 'fb_future_3',  text: "the risk you haven't taken",         temporal: 'future' },
  { id: 'fb_neutral_3', text: 'your first instinct',                temporal: 'neutral' },
]

function parseItems(raw: unknown): CutItemData[] | null {
  if (!Array.isArray(raw)) return null
  const out: CutItemData[] = []
  for (const it of raw) {
    if (it && typeof it === 'object' && typeof (it as Record<string, unknown>).id === 'string' && typeof (it as Record<string, unknown>).text === 'string') {
      const rec = it as Record<string, unknown>
      out.push({ id: rec.id as string, text: rec.text as string, temporal: typeof rec.temporal === 'string' ? rec.temporal : 'neutral' })
    }
  }
  return out.length > 0 ? out : null
}

interface Props {
  onComplete: (responseData: unknown) => void
  /** Parsed fragment payload from buildCut: { seed, items, keep_budget }. Optional
   *  so the dev harness and any older/empty deck still render a fallback field. */
  params?: { seed?: unknown; items?: unknown; keep_budget?: unknown }
  /** Dev-only escape hatch: force motion on even when the OS requests reduced
   *  motion, so the full experience can be evaluated. Never set in production. */
  forceMotion?: boolean
}

export function Cut({ onComplete, params, forceMotion = false }: Props) {
  const reduced = useReducedMotion() && !forceMotion

  // The field + each card's cosmetic scatter jitter, both resolved ONCE at
  // mount (lazy initializer, not useMemo — the parent re-creates the raw
  // payload object every render, same reasoning as Hold/Split). The jitter is
  // seeded so the same night's field always scatters the same way.
  const [{ items: initialItems, rotationById }] = useState(() => {
    const field = parseItems(params?.items) ?? FALLBACK_ITEMS
    const rng = seededRandom(num(params?.seed, 1) >>> 0)
    const rotationById: Record<string, number> = {}
    for (const it of field) rotationById[it.id] = (rng() * 2 - 1) * C.crumbleRotateDeg
    return { items: field, rotationById }
  })
  const keepBudget = clamp(Math.trunc(num(params?.keep_budget, C.keepBudgetFallback)), 1, initialItems.length - 1)
  const fieldSize = initialItems.length

  const [items, setItems] = useState(initialItems)
  const [smoldering, setSmoldering] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closingAuto, setClosingAuto] = useState(false)

  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const fillRefs = useRef<Record<string, HTMLSpanElement | null>>({})

  const mountRef        = useRef(0)
  const lastCutAtRef    = useRef(0)
  const ttfcRef         = useRef<number | null>(null)
  const cutOrderRef     = useRef<CutRecord[]>([])
  const abortedTearsRef = useRef(0)
  const done            = useRef(false)
  // Which card is mid-hold, if any. A ref, not state — it drives no render,
  // and it must never live inside a stale closure: AnimatePresence freezes an
  // exiting card's LAST props (including its pointer handlers) at the render
  // before removal, so a `useState` value read inside those frozen handlers
  // would still see the pre-cut id when the real pointerup physically arrives
  // during the crumble animation — double-counting a completed cut as an
  // aborted one. `.current` is always read fresh regardless of closure age.
  const holdingIdRef = useRef<string | null>(null)

  const holdTimerRef      = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const idleSmolderTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const idleAutoCutTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const grainTimerRef     = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const finishTimerRef    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  // A completed hold or the idle auto-cut timer both just request a cut — they
  // never touch Date.now()/Math.random() themselves. A null id means "the
  // effect below must pick the victim" (the auto-cut path). Every request is a
  // fresh object so the effect re-fires even if the same id is requested twice
  // in a row. This — timing/randomness read only inside a useEffect, never in a
  // handler body — is the same fix Split's commit effect already established
  // (react-hooks/purity): a plain function invoked from a JSX handler or a
  // setTimeout callback still gets analyzed as render-reachable, so any
  // Date.now()/Math.random() call inside one is flagged regardless of how
  // indirectly it's invoked.
  const [cutRequest, setCutRequest] = useState<{ id: string | null; auto: boolean } | null>(null)

  useEffect(() => {
    mountRef.current = Date.now()
    return () => {
      clearTimeout(holdTimerRef.current)
      clearTimeout(idleSmolderTimer.current)
      clearTimeout(idleAutoCutTimer.current)
      clearTimeout(grainTimerRef.current)
      clearTimeout(finishTimerRef.current)
      document.documentElement.style.removeProperty('--grain-opacity')
    }
  }, [])

  // Schedules both the smolder warning and the auto-cut deadline — no setState,
  // so the mount effect below can call it directly (smoldering already starts
  // false; nothing needs resetting there).
  function scheduleIdleTimers() {
    clearTimeout(idleSmolderTimer.current)
    clearTimeout(idleAutoCutTimer.current)
    if (done.current) return
    idleSmolderTimer.current = setTimeout(() => setSmoldering(true), C.idleSmolderMs)
    idleAutoCutTimer.current = setTimeout(() => setCutRequest({ id: null, auto: true }), C.idleAutoCutMs)
  }
  // Re-arms after activity (a hold starting, an abort, a processed cut) — also
  // resets the visible smolder, unlike the mount-time schedule above.
  function armIdleTimers() {
    setSmoldering(false)
    scheduleIdleTimers()
  }
  useEffect(() => { scheduleIdleTimers() }, [])

  function surgeGrain() {
    // An opacity pulse, not positional motion — plays regardless of
    // prefers-reduced-motion (see the reduced-motion carve-out this codebase
    // follows: only drift/sweep/slide-style motion is gated).
    document.documentElement.style.setProperty('--grain-opacity', String(C.grainSurge))
    clearTimeout(grainTimerRef.current)
    grainTimerRef.current = setTimeout(() => {
      document.documentElement.style.removeProperty('--grain-opacity')
    }, C.grainSurgeMs)
  }

  function finish(survivors: CutItemData[], lastWasAuto: boolean, now: number) {
    if (done.current) return
    done.current = true
    document.documentElement.style.removeProperty('--grain-opacity')
    setClosing(true)
    setClosingAuto(lastWasAuto)
    const data = {
      v: 1,
      field_size: fieldSize,
      keep_budget: keepBudget,
      cuts: cutOrderRef.current,
      aborted_tears: abortedTearsRef.current,
      auto_cuts: cutOrderRef.current.filter(c => c.auto).length,
      survivors: survivors.map(i => i.id),
      ttfc_ms: ttfcRef.current,
      total_ms: now - mountRef.current,
    }
    finishTimerRef.current = setTimeout(() => onCompleteRef.current(data), C.closeMs)
  }

  // Processes one cut end-to-end: picks the victim (if this was an auto-cut),
  // reads the clock once, records it, updates the field, and — if the budget
  // is reached — schedules the close. The ONLY place in this component that
  // calls Date.now()/Math.random().
  useEffect(() => {
    if (!cutRequest || done.current) return
    const pool = itemsRef.current
    let targetId = cutRequest.id
    if (targetId === null) {
      // Auto-cut: never interrupt a hold genuinely in progress (armIdleTimers
      // resets this timer on every hold start, so in practice this can't
      // actually race — tearHoldMs is 900ms against a 15s idle deadline — but
      // stay defensive rather than assume the timing).
      if (holdingIdRef.current || pool.length <= keepBudget) return
      targetId = pool[Math.floor(Math.random() * pool.length)].id // #nosec G404 — cosmetic pick, no crypto need
    }
    const item = pool.find(i => i.id === targetId)
    if (!item) return

    const now = Date.now()
    if (ttfcRef.current === null) ttfcRef.current = now - mountRef.current
    cutOrderRef.current.push({
      id: item.id,
      temporal: item.temporal,
      order: cutOrderRef.current.length,
      ms: now - mountRef.current,
      chosen_after_ms: now - (lastCutAtRef.current || mountRef.current),
      auto: cutRequest.auto,
    })
    lastCutAtRef.current = now

    const nextItems = pool.filter(i => i.id !== targetId)
    setItems(nextItems)
    holdingIdRef.current = null
    surgeGrain()
    playSound('click')
    haptic('tap')

    if (nextItems.length <= keepBudget) {
      clearTimeout(idleSmolderTimer.current)
      clearTimeout(idleAutoCutTimer.current)
      setSmoldering(false)
      finishTimerRef.current = setTimeout(() => finish(nextItems, cutRequest.auto, now), C.crumbleMs)
    } else {
      armIdleTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutRequest])

  // Press-and-hold to tear. A CSS-transition-driven fill (linear, over
  // tearHoldMs) rather than a per-frame loop — Cut's fill has no physics to
  // sync against, unlike the Hold's breathing ring. Set imperatively (not via
  // React state) so starting/aborting never fights a re-render mid-transition.
  function startTear(id: string) {
    if (done.current || holdingIdRef.current || closing) return
    holdingIdRef.current = id
    armIdleTimers()

    const fill = fillRefs.current[id]
    if (fill) {
      fill.style.transition = 'none'
      fill.style.transform = 'scaleX(0)'
      void fill.offsetWidth // force reflow so the next transition actually animates
      fill.style.transition = `transform ${C.tearHoldMs}ms linear`
      fill.style.transform = 'scaleX(1)'
    }
    const card = cardRefs.current[id]
    if (card) {
      card.style.transition = 'none'
      card.style.boxShadow = 'none'
      void card.offsetWidth
      card.style.transition = `box-shadow ${C.tearHoldMs}ms linear`
      card.style.boxShadow = `0 0 ${C.tearGlowMaxPx}px rgba(${C.red}, 0.6)`
    }
    holdTimerRef.current = setTimeout(() => setCutRequest({ id, auto: false }), C.tearHoldMs)
  }

  // Released before the hold completed — a reach that didn't commit. Recorded
  // as an aborted tear (ambivalence), same idea as the Hold's release_attempts.
  function abortTear(id: string) {
    if (holdingIdRef.current !== id) return
    clearTimeout(holdTimerRef.current)
    const fill = fillRefs.current[id]
    if (fill) {
      fill.style.transition = `transform ${C.abortSnapMs}ms ease-out`
      fill.style.transform = 'scaleX(0)'
    }
    const card = cardRefs.current[id]
    if (card) {
      card.style.transition = `box-shadow ${C.abortSnapMs}ms ease-out`
      card.style.boxShadow = 'none'
    }
    abortedTearsRef.current += 1
    holdingIdRef.current = null
    armIdleTimers()
  }

  // a11y: a keyboard / assistive-tech activation fires a click with detail 0
  // (no pointer) — holding isn't possible there, so it commits the cut
  // instantly, mirroring the Hold's clickRelease.
  function clickCut(e: React.MouseEvent, id: string) {
    if (e.detail === 0) setCutRequest({ id, auto: false })
  }

  // Bare, named handlers (not inline JSX arrows) reading the target item's id
  // from the DOM rather than a per-item closure — mirrors the Hold's
  // startRelease/abortRelease/clickRelease, which take the same shape.
  function handleCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const id = e.currentTarget.dataset.itemId
    if (id) startTear(id)
  }
  function handleCardPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const id = e.currentTarget.dataset.itemId
    if (id) abortTear(id)
  }
  function handleCardClick(e: React.MouseEvent<HTMLDivElement>) {
    const id = e.currentTarget.dataset.itemId
    if (id) clickCut(e, id)
  }

  const remainingToCut = Math.max(0, items.length - keepBudget)

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: MG.space.mobilePad, gap: MG.space.mobileGap,
      userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          {copy.cut.keepLabel(keepBudget)}
        </span>
        <span aria-live="polite" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          {closing ? '' : copy.cut.remainingLabel(remainingToCut)}
        </span>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${C.gridCols}, 1fr)`,
        gap: C.gridGap, width: '100%', maxWidth: C.cardMaxW,
      }}>
        <AnimatePresence>
          {items.map(item => (
            <motion.div
              key={item.id}
              layout={reduced ? undefined : true}
              initial={false}
              exit={{
                opacity: 0,
                scale: reduced ? 1 : 0.35,
                rotate: reduced ? 0 : rotationById[item.id] ?? 0,
              }}
              transition={{ duration: C.crumbleMs / 1000, ease: 'easeIn' }}
              style={{ rotate: reduced ? 0 : (rotationById[item.id] ?? 0) * 0.3 }}
            >
              <div
                ref={el => { cardRefs.current[item.id] = el }}
                data-item-id={item.id}
                role="button"
                tabIndex={closing ? -1 : 0}
                aria-label={copy.cut.tearAria(item.text)}
                onPointerDown={handleCardPointerDown}
                onPointerUp={handleCardPointerUp}
                onPointerLeave={handleCardPointerUp}
                onPointerCancel={handleCardPointerUp}
                onClick={handleCardClick}
                style={{
                  position: 'relative', overflow: 'hidden',
                  minHeight: C.cardMinH, minWidth: MIN_TOUCH_TARGET,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 'var(--space-3)', textAlign: 'center',
                  border: `1px solid ${closing ? `rgba(${C.presence}, 0.5)` : 'var(--border-active)'}`,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface)',
                  cursor: closing ? 'default' : 'pointer',
                  touchAction: 'none',
                  boxShadow: closing ? `0 0 ${C.keptGlowMaxPx}px rgba(${C.presence}, ${C.keptGlowAlpha})` : 'none',
                  animation: smoldering && !closing
                    ? `cutSmolder 1.6s ease-in-out infinite`
                    : undefined,
                  ['--cut-smolder-px' as string]: `${C.smolderGlowPx}px`,
                  ['--cut-smolder-alpha' as string]: C.smolderMaxAlpha,
                  transition: 'border-color 0.3s ease-out',
                }}
              >
                <span style={{
                  position: 'relative', zIndex: 1,
                  fontFamily: 'var(--font-display)', fontStyle: 'italic',
                  fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-sm)',
                  color: 'var(--text-secondary)',
                }}>
                  {item.text}
                </span>
                {/* the tear fill — a red edge creeping in as you hold */}
                <span
                  ref={el => { fillRefs.current[item.id] = el }}
                  aria-hidden
                  style={{
                    position: 'absolute', inset: 0, transformOrigin: 'left',
                    transform: 'scaleX(0)', background: `rgba(${C.red}, 0.16)`,
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div style={{ minHeight: 'var(--space-6)', display: 'flex', alignItems: 'center' }} aria-live="polite">
        {closing && (
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)', letterSpacing: '0.06em',
          }}>
            {closingAuto ? copy.cut.autoCutClose : copy.cut.close}
          </p>
        )}
      </div>
    </div>
  )
}
