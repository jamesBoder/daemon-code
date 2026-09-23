import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import {
  PROSE_MAX_WIDTH,
  MAX_CONTENT_WIDTH,
  HAIRLINE,
  LETTER_SPACING_WIDE,
  LETTER_SPACING_COMPILE,
} from '../../lib/constants'

// The Map as a deck fragment. Ported from the standalone screens/Pulse.tsx
// (which stays live until the console cutover): same node/wire canvas, but the
// fetch/mutation/navigation shell is gone — SessionContainer owns delivery and
// posting, so this just plays scenario → map → reveal and hands back the
// response_data the Analyst's computePulseSignals expects.

export interface PulseNode { id: string; text: string }
export interface PulseConnection { a: string; b: string }

interface Props {
  scenarioId: string
  text: string
  observation: string
  prediction: string
  nodes: PulseNode[]
  onComplete: (responseData: unknown) => void
}

const PHASE_FADE = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }

type Phase = 1 | 2 | 3

const CENTER_ID = 'center'

// All Map geometry, timing, and color values — no bare values in render code.
const MAP = {
  scenarioHoldMs:     1200,   // Phase 1 hold — kept under reduced motion (pacing, not motion)
  phaseFadeS:         0.35,
  maxWires:           3,
  // Node bootstrap
  bootstrapStaggerMs: 130,    // per-node entrance delay
  flickerS:           0.35,   // per-node flicker duration
  // Canvas
  dotGridSizePx:      24,
  snapRadiusPx:       56,
  dragThresholdPx:    8,
  nodeMaxWidthPx:     128,
  centerNodeScale:    1.15,   // center anchor is slightly larger
  jitterPct:          4,      // ± jitter applied to slot positions, seeded from scenario_id
  // Slot positions — percentages are node centers. Kept inside the nodeSafe*
  // band so a full-width (nodeMaxWidthPx) node never clips the canvas edge.
  slots: [
    { x: 24, y: 17 }, { x: 76, y: 15 },
    { x: 21, y: 50 }, { x: 79, y: 48 },
    { x: 27, y: 83 }, { x: 71, y: 81 },
  ],
  centerSlot:         { x: 50, y: 50 },
  // Clamp band (percent of canvas) for node centers after jitter. Half a
  // 128px node is ~20% of a 320px viewport — the narrowest we target — so
  // these insets keep the whole node on-canvas. Vertical leaves room for the
  // label above the box and multi-line wrapping below.
  nodeSafeMinXPct:    20,
  nodeSafeMaxXPct:    80,
  nodeSafeMinYPct:    14,
  nodeSafeMaxYPct:    86,
  // Wires
  wireStrokeWidth:    1.5,
  wireDash:           '6 3',
  wireDashSpeedPxS:   12,     // dash flow speed (px/s) for the data-packet effect
  wireFadeS:          0.2,    // sever: wire fade-out
  severFlashMs:       300,    // sever: node border flash total (150 in + 150 out)
  linkedTotalMs:      800,    // >> linked: 200 fade in + 400 hold + 200 fade out
  linkedFadeS:        0.2,
  // Phase 3
  ghostOpacity:       0.15,
  overlayBg:          'rgba(0, 0, 0, 0.75)',
  overlayBlurPx:      12,
  typeCharMs:         15,     // typewriter speed per character
  observationHoldMs:  2000,   // hold after last character before prediction fades in
  predictionFadeS:    0.4,
  separatorWidthPx:   48,
} as const
// ── Seeded jitter ────────────────────────────────────────────────────────────

function seedFromString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface NodePosition { x: number; y: number }

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

function computePositions(scenarioId: string, nodes: PulseNode[]): Record<string, NodePosition> {
  const rng = mulberry32(seedFromString(scenarioId))
  const jitter = () => (rng() * 2 - 1) * MAP.jitterPct
  const out: Record<string, NodePosition> = {
    [CENTER_ID]: { ...MAP.centerSlot },
  }
  nodes.forEach((n, i) => {
    const slot = MAP.slots[i % MAP.slots.length]
    out[n.id] = {
      x: clamp(slot.x + jitter(), MAP.nodeSafeMinXPct, MAP.nodeSafeMaxXPct),
      y: clamp(slot.y + jitter(), MAP.nodeSafeMinYPct, MAP.nodeSafeMaxYPct),
    }
  })
  return out
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function PulseMap({ scenarioId, text, observation, prediction, nodes, onComplete }: Props) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<Phase>(1)
  const submittedRef = useRef(false)
  const responseRef = useRef<unknown>(null)

  // Scenario hold — kept under reduced motion (pacing, not motion).
  useEffect(() => {
    if (phase !== 1) return
    const t = setTimeout(() => setPhase(2), MAP.scenarioHoldMs)
    return () => clearTimeout(t)
  }, [phase])

  const handleCompile = useCallback((connections: PulseConnection[], firstWireDelayMs: number | null, durationMs: number) => {
    if (submittedRef.current) return
    submittedRef.current = true
    const wired = new Set<string>()
    for (const c of connections) {
      wired.add(c.a)
      wired.add(c.b)
    }
    responseRef.current = {
      source:              'pulse',
      scenario_id:         scenarioId,
      connections,
      isolated_nodes:      [...nodes.map((n) => n.id), CENTER_ID].filter((id) => !wired.has(id)),
      first_wire_delay_ms: firstWireDelayMs,
      duration_ms:         durationMs,
    }
    setPhase(3)
  }, [scenarioId, nodes])

  // The response posts only once the reveal is read — SessionContainer advances
  // the moment onComplete fires, so calling it at compile would cut the daemon's
  // observation off.
  // Guarded: the reveal overlay calls this on every tap after the prediction
  // shows, and SessionContainer would post + advance once per call.
  const finishedRef = useRef(false)
  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    onComplete(responseRef.current)
  }, [onComplete])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <AnimatePresence mode="wait">
        {phase === 1 && (
          <PhaseScenario key="p1" text={text} reduced={reduced} onAdvance={() => setPhase(2)} />
        )}
        {(phase === 2 || phase === 3) && (
          <PhaseMap
            key="p2"
            phase={phase}
            scenarioId={scenarioId}
            text={text}
            observation={observation}
            prediction={prediction}
            nodes={nodes}
            reduced={reduced}
            onCompile={handleCompile}
            onRevealDone={finish}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Phase 1 — Scenario Reveal ────────────────────────────────────────────────

function PhaseScenario({ text, reduced, onAdvance }: { text: string; reduced: boolean; onAdvance: () => void }) {
  return (
    <motion.div
      {...PHASE_FADE}
      transition={{ duration: reduced ? 0 : MAP.phaseFadeS }}
      onClick={onAdvance}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 var(--space-8)',
        cursor: 'default',
      }}
    >
      <p style={{
        fontFamily: 'var(--font-serif)',
        fontSize:   'var(--text-xl)',
        color:      'var(--text-primary)',
        textAlign:  'center',
        maxWidth:   PROSE_MAX_WIDTH,
        lineHeight: 'var(--leading-relaxed)',
      }}>
        {text}
      </p>
    </motion.div>
  )
}

interface PendingPointer {
  id: string
  startX: number
  startY: number
  isMouse: boolean
  dragging: boolean
}
function PhaseMap({
  phase,
  scenarioId,
  text,
  observation,
  prediction,
  nodes,
  reduced,
  onCompile,
  onRevealDone,
}: {
  phase: 2 | 3
  scenarioId: string
  text: string
  observation: string
  prediction: string
  nodes: PulseNode[]
  reduced: boolean
  onCompile: (connections: PulseConnection[], firstWireDelayMs: number | null, durationMs: number) => void
  onRevealDone: () => void
}) {
  const positions = useMemo(() => computePositions(scenarioId, nodes), [scenarioId, nodes])

  const [bootstrapDone, setBootstrapDone] = useState(false)
  const [selected, setSelected]           = useState<string | null>(null)
  const [connections, setConnections]     = useState<PulseConnection[]>([])
  const [fadingWires, setFadingWires]     = useState<PulseConnection[]>([])
  const [flashNodes, setFlashNodes]       = useState<Set<string>>(new Set())
  const [linkedFlash, setLinkedFlash]     = useState(0) // counter; >0 renders the flash
  const [dragLine, setDragLine]           = useState<{ originId: string; x: number; y: number } | null>(null)

  const canvasRef          = useRef<HTMLDivElement>(null)
  const wireGroupRef       = useRef<SVGGElement>(null)
  const pendingRef         = useRef<PendingPointer | null>(null)
  const interactiveAtRef   = useRef(0) // epoch: node bootstrap complete
  const firstWireDelayRef  = useRef<number | null>(null)

  // Node bootstrap — interaction and timing epochs start when it completes.
  useEffect(() => {
    const totalMs = reduced ? 0 : nodes.length * MAP.bootstrapStaggerMs + MAP.flickerS * 1000
    const t = setTimeout(() => {
      setBootstrapDone(true)
      interactiveAtRef.current = Date.now()
    }, totalMs)
    return () => clearTimeout(t)
  }, [nodes.length, reduced])

  // Wire dash flow — rAF mutating attributes directly; static dashes on reduced motion.
  useEffect(() => {
    if (reduced || phase !== 2) return
    let rafId: number
    const start = performance.now()
    const tick = (now: number) => {
      const offset = -((now - start) / 1000) * MAP.wireDashSpeedPxS
      wireGroupRef.current?.querySelectorAll('line').forEach((l) => {
        l.setAttribute('stroke-dashoffset', String(offset))
      })
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [reduced, phase])

  const interactive = phase === 2 && bootstrapDone

  // resolveWire: create / sever / no-op between two distinct node IDs.
  const resolveWire = useCallback((a: string, b: string): 'create' | 'sever' | 'noop' => {
    const key = pairKey(a, b)
    const existing = connections.find((c) => pairKey(c.a, c.b) === key)
    if (existing) {
      setConnections((prev) => prev.filter((c) => pairKey(c.a, c.b) !== key))
      setFadingWires((prev) => [...prev, existing])
      setTimeout(() => setFadingWires((prev) => prev.filter((c) => pairKey(c.a, c.b) !== key)), MAP.wireFadeS * 1000)
      setFlashNodes(new Set([a, b]))
      setTimeout(() => setFlashNodes(new Set()), MAP.severFlashMs)
      return 'sever'
    }
    if (connections.length >= MAP.maxWires) return 'noop'
    if (firstWireDelayRef.current === null && connections.length === 0) {
      firstWireDelayRef.current = Date.now() - interactiveAtRef.current
    }
    setConnections((prev) => [...prev, { a, b }])
    setLinkedFlash((n) => n + 1)
    return 'create'
  }, [connections])

  // Tap model — canonical on all devices.
  const handleTap = useCallback((id: string) => {
    if (!interactive) return
    if (selected === null) {
      setSelected(id)
      return
    }
    if (selected === id) {
      setSelected(null)
      return
    }
    const action = resolveWire(selected, id)
    if (action !== 'noop') setSelected(null) // at 3 wires selection persists — it's the only path to severing
  }, [interactive, selected, resolveWire])

  // Desktop drag enhancement (mouse pointers only).
  const nodeCenterPx = useCallback((id: string) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const pos = positions[id]
    if (!rect || !pos) return null
    return { x: rect.left + (pos.x / 100) * rect.width, y: rect.top + (pos.y / 100) * rect.height }
  }, [positions])

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    if (!interactive) return
    pendingRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      isMouse: e.pointerType === 'mouse',
      dragging: false,
    }
    if (e.pointerType === 'mouse') {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
  }

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const p = pendingRef.current
    if (!p || !p.isMouse) return
    if (!p.dragging) {
      const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY)
      if (dist < MAP.dragThresholdPx) return
      p.dragging = true
    }
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) setDragLine({ originId: p.id, x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const onCanvasPointerUp = (e: React.PointerEvent) => {
    const p = pendingRef.current
    pendingRef.current = null
    setDragLine(null)
    if (!p || !interactive) return
    if (!p.dragging) {
      handleTap(p.id)
      return
    }
    // Drag release: snap to the nearest other node within radius, else cancel.
    let target: string | null = null
    let best: number = MAP.snapRadiusPx
    for (const id of Object.keys(positions)) {
      if (id === p.id) continue
      const c = nodeCenterPx(id)
      if (!c) continue
      const d = Math.hypot(e.clientX - c.x, e.clientY - c.y)
      if (d < best) {
        best = d
        target = id
      }
    }
    if (target) resolveWire(p.id, target)
  }

  const handleCompileTap = () => {
    if (!interactive) return
    onCompile(connections, firstWireDelayRef.current, Date.now() - interactiveAtRef.current)
  }

  const ghost = phase === 3

  return (
    <motion.div
      {...PHASE_FADE}
      transition={{ duration: reduced ? 0 : MAP.phaseFadeS }}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', justifyContent: 'center',
      }}
    >
      <div style={{
        width: '100%', maxWidth: MAX_CONTENT_WIDTH,
        display: 'flex', flexDirection: 'column',
        position: 'relative',
        opacity: ghost ? MAP.ghostOpacity : 1,
        transition: reduced ? 'none' : `opacity ${MAP.phaseFadeS}s ease`,
        pointerEvents: ghost ? 'none' : 'auto',
      }}>
        {/* Persistent scenario header */}
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize:   'var(--text-sm)',
          color:      'var(--text-primary)',
          opacity:    0.3,
          textAlign:  'center',
          padding:    'calc(var(--space-8) + env(safe-area-inset-top)) var(--space-4) var(--space-4)',
          margin:     0,
          flexShrink: 0,
        }}>
          {text}
        </p>

        {/* Node canvas */}
        <div
          ref={canvasRef}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          style={{
            flex: 1,
            position: 'relative',
            touchAction: 'none',
            backgroundImage: `radial-gradient(var(--border) 1px, transparent 1px)`,
            backgroundSize: `${MAP.dotGridSizePx}px ${MAP.dotGridSizePx}px`,
          }}
        >
          {/* Wire overlay — decorative; connection state lives in the node buttons */}
          <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            <g ref={wireGroupRef}>
              {connections.map((c) => {
                const pa = positions[c.a]
                const pb = positions[c.b]
                if (!pa || !pb) return null
                return (
                  <line
                    key={pairKey(c.a, c.b)}
                    x1={`${pa.x}%`} y1={`${pa.y}%`}
                    x2={`${pb.x}%`} y2={`${pb.y}%`}
                    stroke="var(--accent)"
                    strokeWidth={MAP.wireStrokeWidth}
                    strokeDasharray={MAP.wireDash}
                  />
                )
              })}
            </g>
            {fadingWires.map((c) => {
              const pa = positions[c.a]
              const pb = positions[c.b]
              if (!pa || !pb) return null
              return (
                <motion.line
                  key={`fade-${pairKey(c.a, c.b)}`}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : MAP.wireFadeS }}
                  x1={`${pa.x}%`} y1={`${pa.y}%`}
                  x2={`${pb.x}%`} y2={`${pb.y}%`}
                  stroke="var(--accent)"
                  strokeWidth={MAP.wireStrokeWidth}
                  strokeDasharray={MAP.wireDash}
                />
              )
            })}
            {dragLine && positions[dragLine.originId] && (
              <line
                x1={`${positions[dragLine.originId].x}%`}
                y1={`${positions[dragLine.originId].y}%`}
                x2={dragLine.x} y2={dragLine.y}
                stroke="var(--accent)"
                strokeWidth={MAP.wireStrokeWidth}
                strokeDasharray={MAP.wireDash}
              />
            )}
          </svg>

          {/* Center anchor */}
          <MapNode
            id={CENTER_ID}
            label="ANCHOR"
            text="◈"
            pos={positions[CENTER_ID]}
            index={0}
            isCenter
            selected={selected === CENTER_ID}
            flashing={flashNodes.has(CENTER_ID)}
            bootstrapDone={bootstrapDone}
            reduced={reduced}
            onPointerDown={onNodePointerDown}
          />

          {/* Outer nodes */}
          {nodes.map((n, i) => (
            <MapNode
              key={n.id}
              id={n.id}
              label={`NODE_0${i + 1}`}
              text={n.text}
              pos={positions[n.id]}
              index={i}
              selected={selected === n.id}
              flashing={flashNodes.has(n.id)}
              bootstrapDone={bootstrapDone}
              reduced={reduced}
              onPointerDown={onNodePointerDown}
            />
          ))}
        </div>

        {/* >> linked flash */}
        <div aria-live="polite" style={{
          position: 'absolute',
          bottom: `calc(env(safe-area-inset-bottom) + var(--space-16))`,
          left: 0, right: 0,
          display: 'flex', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <AnimatePresence>
            {linkedFlash > 0 && (
              <LinkedFlash key={linkedFlash} reduced={reduced} onDone={() => setLinkedFlash(0)} />
            )}
          </AnimatePresence>
        </div>

        {/* compile → (always tappable: a zero-wire submit is a valid sparse session) */}
        <motion.button
          onClick={handleCompileTap}
          whileTap={{ scale: 0.97 }}
          style={{
            position: 'absolute',
            bottom: 'calc(env(safe-area-inset-bottom) + var(--space-6))',
            left: '50%', transform: 'translateX(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE,
            opacity: connections.length === 0 ? 0.3 : 1,
            padding: 'var(--space-3) var(--space-4)',
          }}
        >
          compile →
        </motion.button>
      </div>

      {/* Phase 3 — Observation + Prediction overlay */}
      {ghost && (
        <RevealOverlay
          observation={observation}
          prediction={prediction}
          reduced={reduced}
          onDone={onRevealDone}
        />
      )}
    </motion.div>
  )
}

// ── Node ─────────────────────────────────────────────────────────────────────

function MapNode({
  id,
  label,
  text,
  pos,
  index,
  isCenter = false,
  selected,
  flashing,
  bootstrapDone,
  reduced,
  onPointerDown,
}: {
  id: string
  label: string
  text: string
  pos: NodePosition
  index: number
  isCenter?: boolean
  selected: boolean
  flashing: boolean
  bootstrapDone: boolean
  reduced: boolean
  onPointerDown: (e: React.PointerEvent, id: string) => void
}) {
  const borderColor = flashing
    ? 'var(--accent)'
    : selected
      ? 'var(--border-active)'
      : 'var(--border)'

  return (
    <motion.button
      initial={reduced ? { opacity: 1 } : { opacity: 0 }}
      animate={reduced || bootstrapDone
        ? { opacity: 1 }
        : { opacity: [0, 1, 0.3, 1] }} // terminal-bootstrap flicker
      transition={reduced
        ? { duration: 0 }
        : { duration: MAP.flickerS, delay: (index * MAP.bootstrapStaggerMs) / 1000 }}
      onPointerDown={(e) => onPointerDown(e, id)}
      aria-pressed={selected}
      aria-label={isCenter ? 'scenario anchor' : text}
      style={{
        position: 'absolute',
        left: `${pos.x}%`, top: `${pos.y}%`,
        transform: `translate(-50%, -50%) ${isCenter ? `scale(${MAP.centerNodeScale})` : ''}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 'var(--space-1)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        maxWidth: MAP.nodeMaxWidthPx,
      }}
    >
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize:   'var(--text-xs)',
        color:      'var(--compile-green)',
        letterSpacing: LETTER_SPACING_COMPILE,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-serif)',
        fontSize:   'var(--text-base)',
        color:      selected ? 'var(--text-primary)' : 'var(--text-secondary)',
        border:     `${HAIRLINE} solid ${borderColor}`,
        borderRadius: 'var(--radius-md)',
        padding:    'var(--space-2) var(--space-3)',
        textAlign:  'center',
        boxShadow:  selected ? '0 0 12px color-mix(in srgb, var(--accent) 40%, transparent)' : 'none',
        transition: reduced ? 'none' : `border-color ${MAP.severFlashMs / 2}ms ease, box-shadow ${MAP.severFlashMs / 2}ms ease`,
        lineHeight: 'var(--leading-snug)',
      }}>
        {text}
      </span>
    </motion.button>
  )
}

// ── >> linked feedback ───────────────────────────────────────────────────────

function LinkedFlash({ reduced, onDone }: { reduced: boolean; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, MAP.linkedTotalMs)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <motion.span
      initial={{ opacity: reduced ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : MAP.linkedFadeS }}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize:   'var(--text-xs)',
        color:      'var(--compile-green)',
        letterSpacing: LETTER_SPACING_COMPILE,
      }}
    >
      {'>> linked'}
    </motion.span>
  )
}

// ── Phase 3 — Observation + Prediction ───────────────────────────────────────

function RevealOverlay({
  observation,
  prediction,
  reduced,
  onDone,
}: {
  observation: string
  prediction: string
  reduced: boolean
  onDone: () => void
}) {
  const [charIdx, setCharIdx] = useState(reduced ? observation.length : 0)
  const [showPrediction, setShowPrediction] = useState(reduced)

  // Typewriter — visual only; the aria-live region exposes the full text immediately.
  // One interval for the whole animation, self-clearing on completion --
  // charIdx was previously a dependency of this same effect, so every tick
  // tore down and recreated a new setInterval instead of letting one run.
  useEffect(() => {
    if (reduced) return
    const t = setInterval(() => {
      setCharIdx((i) => {
        if (i >= observation.length) {
          clearInterval(t)
          return i
        }
        return i + 1
      })
    }, MAP.typeCharMs)
    return () => clearInterval(t)
  }, [reduced, observation.length])

  // Observation hold, then prediction.
  useEffect(() => {
    if (showPrediction || charIdx < observation.length) return
    const t = setTimeout(() => setShowPrediction(true), MAP.observationHoldMs)
    return () => clearTimeout(t)
  }, [charIdx, observation.length, showPrediction])

  // Tap during typewriter completes the text; tap after prediction advances.
  const handleTap = () => {
    if (charIdx < observation.length) {
      setCharIdx(observation.length)
      return
    }
    if (showPrediction) onDone()
  }

  return (
    <div
      onClick={handleTap}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-5)',
        cursor: 'default',
      }}
    >
      <div
        aria-live="polite"
        style={{
          maxWidth: PROSE_MAX_WIDTH,
          background: MAP.overlayBg,
          backdropFilter: `blur(${MAP.overlayBlurPx}px)`,
          WebkitBackdropFilter: `blur(${MAP.overlayBlurPx}px)`,
          padding: 'var(--space-6)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 'var(--space-4)',
        }}
      >
        {/* Full text for screen readers — the typewriter is visual-only */}
        <span style={{
          position: 'absolute', width: 1, height: 1, overflow: 'hidden',
          clipPath: 'inset(50%)', whiteSpace: 'nowrap',
        }}>
          {observation} {prediction}
        </span>

        <p aria-hidden="true" style={{
          fontFamily: 'var(--font-serif)',
          fontSize:   'var(--text-lg)',
          fontStyle:  'italic',
          color:      'var(--text-daemon)',
          textAlign:  'center',
          lineHeight: 'var(--leading-relaxed)',
          margin: 0,
        }}>
          {observation.slice(0, charIdx)}
        </p>

        {showPrediction && (
          <>
            <motion.div
              initial={{ opacity: reduced ? 1 : 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduced ? 0 : MAP.predictionFadeS }}
              style={{ width: MAP.separatorWidthPx, height: HAIRLINE, background: 'var(--border)' }}
            />
            <motion.p
              aria-hidden="true"
              initial={{ opacity: reduced ? 1 : 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduced ? 0 : MAP.predictionFadeS }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize:   'var(--text-xs)',
                color:      'var(--text-muted)',
                textAlign:  'center',
                lineHeight: 'var(--leading-relaxed)',
                margin: 0,
              }}
            >
              {prediction}
            </motion.p>
          </>
        )}
      </div>
    </div>
  )
}
