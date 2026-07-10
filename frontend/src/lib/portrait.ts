import type { SelfRead } from '../types'

// The Portrait — a generative form rendered from the daemon's dimension read.
// P1 (features-horizon): the model becomes visible as a *shape*, never a chart.
// Each dimension maps to a visual parameter; confidence maps to resolution (a
// low-confidence read renders blurred and muffled, a deep read sharp and present).
// All tunables live here as a named config — no magic numbers in the renderer.

export const PORTRAIT = {
  // Lobe field — the organic form is layered closed curves around a centre.
  lobeMin: 3, // lobe count at openness 0
  lobeMax: 9, // lobe count at openness 1
  pointsPerLobe: 96, // vertices per closed curve (smoothness)
  baseRadius: 0.30, // fraction of the min canvas side, before expansion
  expandRange: 0.18, // additional radius fraction from approach (0..1)
  lobeDepth: 0.42, // how deep the lobe valleys cut (form complexity)

  // Per-dimension modulation strengths.
  turbulenceAmp: 0.22, // neuroticism → edge wobble, fraction of radius
  symmetryJitter: 0.5, // (1-conscientiousness) → angular irregularity (radians spread)
  dispersion: 0.34, // (external locus) → how far layers drift off-centre
  flowBias: 0.22, // temporal_focus → vertical offset of the whole form

  // Colour. Openness drives temperature across a cool→warm sweep.
  hueCool: 212, // openness 0 (cool indigo/blue)
  hueWarm: 28, // openness 1 (warm amber)
  saturation: 62, // %
  lightness: 56, // %
  layerAlpha: 0.16, // base fill alpha per layer (softness scales this)
  softnessAlphaBoost: 0.14, // agreeableness adds up to this much alpha (merging)

  // Resolution (confidence). Low confidence → blurred, dim, fewer layers.
  blurMaxPx: 26, // blur at confidence 0
  blurMinPx: 0.4, // blur at confidence 1
  alphaFloor: 0.45, // overall opacity at confidence 0 (muffled)
  layersMin: 2, // drawn layers at confidence 0
  layersMax: 6, // drawn layers at confidence 1
  coreGlow: 0.5, // central glow strength (presence)

  // Motion (gated by reduced-motion at the call site).
  breatheAmp: 0.018, // scale oscillation amplitude
  breatheSpeed: 0.0006, // radians/ms
  rotateSpeed: 0.000035, // radians/ms (slow drift)

  // Render detail — the curve/gradient shaping constants the renderer applies.
  // Hoisted out of draw()/tracePetal() so the form stays tunable from one place.
  turbFreq: 3, // angular frequency of the neuroticism edge wobble
  asymFreq: 2, // angular frequency of the low-frequency asymmetry
  asymScale: 0.18, // extra scale on the (1-symmetry) asymmetry term
  depthRadiusFalloff: 0.34, // each deeper layer shrinks by depth × this
  layerSpinBase: 0.3, // baseline per-layer rotation spread (× 2π × depth)
  layerSpinRange: 0.4, // additional random per-layer rotation spread
  layerLightGain: 16, // inner layers brighten by depth × this (a core)
  layerHueDrift: 18, // outer gradient stop hue drift by depth × this
  gradInnerLightBoost: 10, // inner gradient stop is this much lighter
  gradInnerAlphaMul: 1.4, // inner gradient stop alpha multiplier
  gradStopInnerFrac: 0.1, // radial-gradient inner stop, fraction of radius
  gradStopOuterFrac: 1.05, // radial-gradient outer stop, fraction of radius
  coreRadiusFrac: 0.16, // central glow radius, fraction of min side
  coreLightness: 78, // central glow lightness (%)
  glowThreshold: 0.01, // skip the core glow below this strength
  blurThresholdPx: 0.5, // skip the blur filter below this many px
} as const

// The seven dimensions the Portrait maps, with a neutral fallback when a read is
// missing (Day 0). 0.5 = no lean; confidence 0 = unknown.
const NEUTRAL = { score: 0.5, confidence: 0 }

export interface PortraitParams {
  complexity: number // lobe count (int)
  symmetry: number // 0..1 (1 = perfectly even lobes)
  turbulence: number // 0..1 (edge agitation)
  softness: number // 0..1 (merging, rounded)
  gravity: number // 0..1 (1 = internal/centred, 0 = external/dispersed)
  expansion: number // 0..1 (1 = reaching outward)
  flow: number // -1..1 (past ↔ future → vertical bias)
  hue: number // degrees
  resolution: number // 0..1 (confidence → sharpness/presence)
  seed: number
}

// Deterministic 32-bit hash of the dimension vector, so the same read always
// produces the same Portrait and a changed read visibly morphs it.
function hashScores(read: SelfRead): number {
  let h = 2166136261
  const dims = read.dimensions ?? {}
  const keys = Object.keys(dims).sort()
  for (const k of keys) {
    const v = dims[k]
    if (!v) continue
    const n = Math.round((v.score + v.confidence) * 1000)
    for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619)
    h = Math.imul(h ^ n, 16777619)
  }
  return h >>> 0
}

// Mulberry32 — small seeded PRNG for reproducible per-portrait variation.
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Map the daemon's read onto visual parameters. The numbers never surface to the
// user — they only shape the form.
export function paramsFromRead(read: SelfRead): PortraitParams {
  const dims = read.dimensions ?? {}
  const dim = (name: string) => dims[name] ?? NEUTRAL
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  const openness = dim('openness').score
  const consc = dim('conscientiousness').score
  const agree = dim('agreeableness').score
  const neuro = dim('neuroticism').score
  const locus = dim('locus_of_control').score // high = internal
  const approach = dim('approach_avoidance').score // high = approach
  const temporal = dim('temporal_focus').score // high = future

  // Resolution: prefer the overall signal confidence, but fall back to the mean
  // per-dimension confidence so a read with dimension data but no rolled-up
  // confidence still renders with some presence.
  const confs = Object.values(dims)
    .map((d) => d?.confidence ?? 0)
    .filter((c) => c > 0)
  const meanConf = confs.length ? confs.reduce((s, c) => s + c, 0) / confs.length : 0
  const resolution = Math.min(1, Math.max(read.signalConfidence, meanConf))

  return {
    complexity: Math.round(lerp(PORTRAIT.lobeMin, PORTRAIT.lobeMax, openness)),
    symmetry: consc,
    turbulence: neuro,
    softness: agree,
    gravity: locus,
    expansion: approach,
    flow: temporal * 2 - 1,
    hue: lerp(PORTRAIT.hueCool, PORTRAIT.hueWarm, openness),
    resolution,
    seed: hashScores(read),
  }
}
