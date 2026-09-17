import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { PORTRAIT, paramsFromRead, prevRead, seededRandom, type PortraitParams } from '../../lib/portrait'
import { PORTRAIT_MORPH_SEEN_KEY } from '../../lib/constants'
import type { SelfRead } from '../../types'

interface Props {
  read: SelfRead
  /** CSS size of the square canvas, in px. */
  size?: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// One organic closed lobe-curve at (ox,oy). The path is deterministic given the
// params + the seeded phases, so the same read always draws the same form.
function tracePetal(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  radius: number,
  p: PortraitParams,
  rotation: number,
  phaseA: number,
  phaseB: number,
  phaseC: number,
) {
  const N = PORTRAIT.pointsPerLobe
  ctx.beginPath()
  for (let i = 0; i <= N; i++) {
    const theta = (i / N) * Math.PI * 2
    // lobes (form complexity) + neuroticism turbulence + low-frequency asymmetry
    // that grows as conscientiousness (symmetry) falls.
    const lobes = 1 + PORTRAIT.lobeDepth * Math.cos(p.complexity * theta + phaseA)
    const turb = p.turbulence * PORTRAIT.turbulenceAmp * Math.sin(PORTRAIT.turbFreq * theta + phaseB)
    const asym =
      (1 - p.symmetry) * PORTRAIT.symmetryJitter * PORTRAIT.asymScale * Math.sin(PORTRAIT.asymFreq * theta + phaseC)
    const r = radius * (lobes + turb + asym)
    const a = theta + rotation
    const x = ox + Math.cos(a) * r
    const y = oy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

// alphaMul scales the whole form's presence — 1 for a settled render; the morph
// crossfades two draws with complementary values. The caller owns clearing.
function draw(ctx: CanvasRenderingContext2D, w: number, h: number, p: PortraitParams, t: number, reduced: boolean, alphaMul = 1) {
  const minSide = Math.min(w, h)
  const cx = w / 2
  const cy = h / 2 - p.flow * minSide * PORTRAIT.flowBias // temporal focus → vertical bias

  // Confidence → resolution: blur, opacity, layer count.
  const blur = lerp(PORTRAIT.blurMaxPx, PORTRAIT.blurMinPx, p.resolution)
  const baseAlpha = lerp(PORTRAIT.alphaFloor, 1, p.resolution)
  const layers = Math.round(lerp(PORTRAIT.layersMin, PORTRAIT.layersMax, p.resolution))

  const breathe = reduced ? 1 : 1 + Math.sin(t * PORTRAIT.breatheSpeed) * PORTRAIT.breatheAmp
  const rot = reduced ? 0 : t * PORTRAIT.rotateSpeed

  const rng = seededRandom(p.seed)
  const dispersion = (1 - p.gravity) * PORTRAIT.dispersion * minSide // external locus → drift off-centre
  const layerAlpha = PORTRAIT.layerAlpha + p.softness * PORTRAIT.softnessAlphaBoost

  ctx.save()
  ctx.globalAlpha = baseAlpha * alphaMul
  ctx.filter = blur > PORTRAIT.blurThresholdPx ? `blur(${blur}px)` : 'none'

  for (let layer = 0; layer < layers; layer++) {
    const depth = layers > 1 ? layer / (layers - 1) : 0
    const ox = cx + (rng() * 2 - 1) * dispersion * depth
    const oy = cy + (rng() * 2 - 1) * dispersion * depth
    const radius =
      minSide * (PORTRAIT.baseRadius + p.expansion * PORTRAIT.expandRange) * breathe * (1 - depth * PORTRAIT.depthRadiusFalloff)
    const layerRot = rot * (1 + depth) + depth * Math.PI * 2 * (PORTRAIT.layerSpinBase + PORTRAIT.layerSpinRange * rng())
    const light = PORTRAIT.lightness + depth * PORTRAIT.layerLightGain // inner layers brighter → sense of a core
    const phaseA = rng() * Math.PI * 2
    const phaseB = rng() * Math.PI * 2
    const phaseC = rng() * Math.PI * 2

    const grad = ctx.createRadialGradient(
      ox, oy, radius * PORTRAIT.gradStopInnerFrac,
      ox, oy, radius * PORTRAIT.gradStopOuterFrac,
    )
    grad.addColorStop(0, `hsla(${p.hue}, ${PORTRAIT.saturation}%, ${light + PORTRAIT.gradInnerLightBoost}%, ${layerAlpha * PORTRAIT.gradInnerAlphaMul})`)
    grad.addColorStop(1, `hsla(${p.hue + depth * PORTRAIT.layerHueDrift}, ${PORTRAIT.saturation}%, ${light}%, ${layerAlpha})`)

    tracePetal(ctx, ox, oy, radius, p, layerRot, phaseA, phaseB, phaseC)
    ctx.fillStyle = grad
    ctx.fill()
  }
  ctx.restore()

  // Central glow — the "presence" of the read; sharpens with confidence.
  const glow = PORTRAIT.coreGlow * p.resolution * alphaMul
  if (glow > PORTRAIT.glowThreshold) {
    const gr = minSide * PORTRAIT.coreRadiusFrac
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr)
    core.addColorStop(0, `hsla(${p.hue}, ${PORTRAIT.saturation}%, ${PORTRAIT.coreLightness}%, ${glow})`)
    core.addColorStop(1, `hsla(${p.hue}, ${PORTRAIT.saturation}%, ${PORTRAIT.coreLightness}%, 0)`)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(cx, cy, gr, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// The Portrait — a generative render of the daemon's read. Pure client-side
// canvas; deterministic per read (morphs as the read deepens). Always grainy
// (the global body grain overlay sits above it).
export function Portrait({ read, size = 280 }: Props) {
  const reduced = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | undefined>(undefined)
  // The drawn edge is the requested size capped to whatever width the container
  // actually offers, so the square never overflows a narrow viewport. Starts at
  // `size` and tightens once the wrapper is measured.
  const [renderSize, setRenderSize] = useState(size)
  // Recompute params only when the read actually changes (hashing + iteration),
  // not on every parent re-render. Driving the effect off `params` also makes the
  // static (reduced-motion) path redraw when the read morphs.
  const params = useMemo<PortraitParams>(() => paramsFromRead(read), [read])
  // The prior snapshot's form — the morph's starting shape. Null when there is
  // no snapshot or it matches the current read.
  const paramsPrev = useMemo<PortraitParams | null>(() => {
    const prev = prevRead(read)
    return prev ? paramsFromRead(prev) : null
  }, [read])

  // Track the available width and cap the square to it (responsive on rotate/resize).
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const measure = () => setRenderSize(Math.min(size, Math.floor(wrap.clientWidth)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [size])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = renderSize * dpr
    canvas.height = renderSize * dpr
    ctx.scale(dpr, dpr)

    if (reduced) {
      // Static render — no motion for prefers-reduced-motion (the morph is a
      // shape transformation, i.e. actual motion, so it is gated too).
      ctx.clearRect(0, 0, renderSize, renderSize)
      draw(ctx, renderSize, renderSize, params, 0, true)
      return
    }

    // The morph: when a differing snapshot exists and this exact pair hasn't
    // played to completion before (localStorage), open as the old form and
    // crossfade into the new one. The pair is marked seen only when the
    // crossfade FINISHES — an interrupted mount (StrictMode's dev double-mount,
    // a quick nav away) doesn't burn the play. One event per pair, ever: the
    // read moves nightly, so fresh pairs keep arriving (wallpaper lesson).
    let morphFrom: PortraitParams | null = null
    let morphKey = ''
    if (paramsPrev) {
      morphKey = `${paramsPrev.seed}>${params.seed}`
      if (localStorage.getItem(PORTRAIT_MORPH_SEEN_KEY) !== morphKey) morphFrom = paramsPrev
    }

    const start = performance.now()
    const loop = (now: number) => {
      const t = now - start
      ctx.clearRect(0, 0, renderSize, renderSize)
      if (morphFrom) {
        const mt = Math.min(1, Math.max(0, (t - PORTRAIT.morphHoldMs) / PORTRAIT.morphMs))
        const eased = mt * mt * (3 - 2 * mt) // smoothstep
        if (eased < 1) draw(ctx, renderSize, renderSize, morphFrom, t, false, 1 - eased)
        if (eased > 0) draw(ctx, renderSize, renderSize, params, t, false, eased)
        if (eased >= 1) {
          localStorage.setItem(PORTRAIT_MORPH_SEEN_KEY, morphKey)
          morphFrom = null // settled — subsequent frames draw the current form directly
        }
      } else {
        draw(ctx, renderSize, renderSize, params, t, false)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
  }, [renderSize, reduced, params, paramsPrev])

  return (
    <div ref={wrapRef} style={{ width: '100%', maxWidth: size, display: 'flex', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        aria-label="Your portrait — the shape of you the daemon has inferred"
        role="img"
        style={{ width: renderSize, height: renderSize, display: 'block' }}
      />
    </div>
  )
}
