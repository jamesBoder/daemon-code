import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { BlinkCursor } from '../components/ui/BlinkCursor'
import { DaemonOrb } from '../components/daemon/DaemonOrb'
import {
  getPulseToday,
  postPulseResponse,
  type PulseScenario,
  type PulseNode,
  type PulseConnection,
} from '../lib/api'
import {
  PROSE_MAX_WIDTH,
  MAX_CONTENT_WIDTH,
  HAIRLINE,
  LETTER_SPACING_WIDE,
  LETTER_SPACING_COMPILE,
  LETTER_SPACING_PROCESS,
  SCREEN_HEADER_HEIGHT,
} from '../lib/constants'
import type { OrbState, HomeData } from '../types'

const PHASE_FADE = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }

type Phase = 0 | 1 | 2 | 3 | 4

const CENTER_ID = 'center'

// All Map geometry, timing, and color values — no bare values in render code.
const MAP = {
  orbSize:            80,
  mappingMs:          600,    // Phase 0 minimum hold (also gated on query resolution)
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
  jitterPct:          5,      // ± jitter applied to slot positions, seeded from scenario_id
  // Slot positions — percentages are node centers
  slots: [
    { x: 18, y: 13 }, { x: 76, y: 9 },
    { x: 9,  y: 50 }, { x: 84, y: 46 },
    { x: 23, y: 84 }, { x: 70, y: 80 },
  ],
  centerSlot:         { x: 50, y: 50 },
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
  // Phase 4
  recordedMs:         2000,
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

function computePositions(scenarioId: string, nodes: PulseNode[]): Record<string, NodePosition> {
  const rng = mulberry32(seedFromString(scenarioId))
  const jitter = () => (rng() * 2 - 1) * MAP.jitterPct
  const out: Record<string, NodePosition> = {
    [CENTER_ID]: { ...MAP.centerSlot },
  }
  nodes.forEach((n, i) => {
    const slot = MAP.slots[i % MAP.slots.length]
    out[n.node_id] = { x: slot.x + jitter(), y: slot.y + jitter() }
  })
  return out
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

// ── Screen ───────────────────────────────────────────────────────────────────

export function Pulse() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const reduced  = useReducedMotion()

  const [phase, setPhase] = useState<Phase>(0)
  const [timerDone, setTimerDone] = useState(false)

  // Scenario captured once — the post-compile invalidation refetch returns
  // { completed: true } and must never yank the user out of Phases 3–4.
  const [scenario, setScenario] = useState<PulseScenario | null>(null)
  const [nodes, setNodes]       = useState<PulseNode[]>([])

  const { data: pulse, isError } = useQuery({
    queryKey: ['pulse'],
    queryFn:  getPulseToday,
    staleTime: 0,
  })

  const homeData = qc.getQueryData<HomeData>(['home'])
  const orbState: OrbState = homeData?.orbState ?? 'cold'

  const mutation = useMutation({
    mutationFn: postPulseResponse,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pulse'] })
    },
  })

  // Capture scenario on first load; redirect guard applies to initial load only.
  useEffect(() => {
    if (scenario) return
    if (isError) {
      navigate('/home', { replace: true })
      return
    }
    if (!pulse) return
    if (pulse.scenario && pulse.nodes?.length && !pulse.completed) {
      setScenario(pulse.scenario)
      setNodes(pulse.nodes)
    } else {
      navigate('/home', { replace: true })
    }
  }, [pulse, isError, scenario, navigate])

  // Phase 0 minimum hold (0ms on reduced motion; the query gate remains).
  useEffect(() => {
    if (phase !== 0) return
    const t = setTimeout(() => setTimerDone(true), reduced ? 0 : MAP.mappingMs)
    return () => clearTimeout(t)
  }, [phase, reduced])

  // Phase 0 → 1 only when both the hold elapsed and the scenario resolved.
  useEffect(() => {
    if (phase === 0 && timerDone && scenario) setPhase(1)
  }, [phase, timerDone, scenario])

  // Phase 1 → 2 after the hold — kept under reduced motion (pacing, not motion).
  useEffect(() => {
    if (phase !== 1) return
    const t = setTimeout(() => setPhase(2), MAP.scenarioHoldMs)
    return () => clearTimeout(t)
  }, [phase])

  // Phase 4 auto-navigate.
  useEffect(() => {
    if (phase !== 4) return
    const t = setTimeout(() => navigate('/home', { replace: true }), MAP.recordedMs)
    return () => clearTimeout(t)
  }, [phase, navigate])

  const submittedRef = useRef(false)
  const handleCompile = useCallback((connections: PulseConnection[], firstWireDelayMs: number | null, durationMs: number) => {
    if (submittedRef.current || !scenario) return
    submittedRef.current = true
    const wired = new Set<string>()
    for (const c of connections) {
      wired.add(c.a)
      wired.add(c.b)
    }
    const isolated = [...nodes.map((n) => n.node_id), CENTER_ID].filter((id) => !wired.has(id))
    // Fire-and-forget by design: the user plays Phases 3–4 regardless. On
    // failure the entry card reappears and the scenario can be replayed.
    mutation.mutate({
      scenario_id:         scenario.scenario_id,
      connections,
      isolated_nodes:      isolated,
      first_wire_delay_ms: firstWireDelayMs,
      duration_ms:         durationMs,
    })
    setPhase(3)
  }, [scenario, nodes, mutation])

  const handleBack = () => navigate('/home', { replace: true })

  return (
    // paddingTop clears the fixed ScreenHeader — without it the scenario text and
    // top nodes render behind the header with no way to reach them (overflow hidden)
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', paddingTop: `calc(${SCREEN_HEADER_HEIGHT}px + env(safe-area-inset-top))` }}>
      {phase < 4 && <ScreenHeader title="" onBack={handleBack} />}

      <div style={{ flex: 1, position: 'relative' }}>
        <AnimatePresence mode="wait">
          {phase === 0 && <PhaseMapping key="p0" orbState={orbState} reduced={reduced} />}

          {phase === 1 && scenario && (
            <PhaseScenario key="p1" text={scenario.text} reduced={reduced} onAdvance={() => setPhase(2)} />
          )}

          {(phase === 2 || phase === 3) && scenario && (
            <PhaseMap
              key="p2"
              phase={phase}
              scenario={scenario}
              nodes={nodes}
              reduced={reduced}
              onCompile={handleCompile}
              onRevealDone={() => setPhase(4)}
            />
          )}

          {phase === 4 && <PhaseRecorded key="p4" reduced={reduced} onTap={() => navigate('/home', { replace: true })} />}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Phase 0 — "mapping." ─────────────────────────────────────────────────────

function PhaseMapping({ orbState, reduced }: { orbState: OrbState; reduced: boolean }) {
  return (
    <motion.div
      {...PHASE_FADE}
      transition={{ duration: reduced ? 0 : MAP.phaseFadeS }}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 'var(--space-4)',
      }}
    >
      <DaemonOrb state={orbState} size={MAP.orbSize} />
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize:   'var(--text-xs)',
        color:      'var(--text-muted)',
        letterSpacing: LETTER_SPACING_WIDE,
      }}>
        mapping.
      </p>
    </motion.div>
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

// ── Phases 2 + 3 — The Map + Observation overlay ────────────────────────────

interface PendingPointer {
  id: string
  startX: number
  startY: number
  isMouse: boolean
  dragging: boolean
}

function PhaseMap({
  phase,
  scenario,
  nodes,
  reduced,
  onCompile,
  onRevealDone,
}: {
  phase: 2 | 3
  scenario: PulseScenario
  nodes: PulseNode[]
  reduced: boolean
  onCompile: (connections: PulseConnection[], firstWireDelayMs: number | null, durationMs: number) => void
  onRevealDone: () => void
}) {
  const positions = useMemo(() => computePositions(scenario.scenario_id, nodes), [scenario.scenario_id, nodes])

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
          padding:    'var(--space-4)',
          margin:     0,
          flexShrink: 0,
        }}>
          {scenario.text}
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
              key={n.node_id}
              id={n.node_id}
              label={`NODE_0${i + 1}`}
              text={n.text}
              pos={positions[n.node_id]}
              index={i}
              selected={selected === n.node_id}
              flashing={flashNodes.has(n.node_id)}
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
          observation={scenario.daemon_observation}
          prediction={scenario.daemon_prediction}
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
  useEffect(() => {
    if (reduced || charIdx >= observation.length) return
    const t = setInterval(() => setCharIdx((i) => Math.min(i + 1, observation.length)), MAP.typeCharMs)
    return () => clearInterval(t)
  }, [reduced, charIdx, observation.length])

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

// ── Phase 4 — "signal recorded. ▋" ───────────────────────────────────────────

function PhaseRecorded({ reduced, onTap }: { reduced: boolean; onTap: () => void }) {
  return (
    <motion.div
      {...PHASE_FADE}
      transition={{ duration: reduced ? 0 : MAP.phaseFadeS }}
      onClick={onTap}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'default',
      }}
    >
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize:   'var(--text-lg)',
        color:      'var(--compile-green)',
        letterSpacing: LETTER_SPACING_PROCESS,
      }}>
        signal recorded.<BlinkCursor />
      </span>
    </motion.div>
  )
}
