import { SHARE_CARD_SIZE } from './constants'
import type { OrbState } from '../types'

// All card geometry for the 1080×1080 shareable card.
// Every layout value lives here — nothing bare in the draw functions.
const S = SHARE_CARD_SIZE  // 1080

const CARD = {
  size:         S,
  // Glass card frame
  w:            840,
  h:            700,
  x:            (S - 840) / 2,               // 120
  y:            (S - 700) / 2,               // 190
  radius:       28,
  padH:         56,                           // horizontal padding inside card
  // Orb
  orbR:         88,
  orbCx:        S / 2,                        // 540
  orbCy:        (S - 700) / 2 + 140,          // 330
  // Prose (Fraunces)
  proseFontPx:  40,
  proseLineH:   56,
  proseCx:      S / 2,                        // 540
  proseY:       (S - 700) / 2 + 140 + 88 + 64,  // 482 = orbCy + orbR + 64
  proseMaxW:    840 - 56 * 2,                 // 728 = w - padH * 2
  // Separator hairline (between prose and processes)
  sepY:         (S - 700) / 2 + 460,          // 650
  // Process names (JetBrains Mono)
  procFontPx:   26,
  procLineH:    44,
  procX:        (S - 840) / 2 + 56,           // 176 = x + padH
  procY:        (S - 700) / 2 + 480,          // 670
  // Footer (day · orbState)
  footFontPx:   22,
  footY:        (S - 700) / 2 + 700 - 54,     // 836 = y + h - 54
  // Brand mark
  brandFontPx:  20,
  brandY:       S - 32,                       // 1048
  // Design tokens — canvas equivalents of CSS custom properties
  bg:           '#070809',
  cardFill:     'rgba(13, 16, 24, 0.78)',
  cardBorder:   'rgba(255, 255, 255, 0.06)',
  textDaemon:   '#c4c9d4',
  textProc:     '#64748b',
  textFoot:     '#475569',
  textBrand:    '#2d3748',
  orbSurface:   '#0d1018',
  orbBorderA:   'rgba(255, 255, 255, 0.12)',  // border-active equivalent
  orbBorderS:   'rgba(255, 255, 255, 0.03)',  // border-subtle equivalent
  noiseAlpha:   0.04,
  hairline:     0.5,                          // canvas lineWidth for all border strokes
} as const

// Mirrors DaemonOrb.tsx orbVisuals — must stay in sync if that component changes
const ORB_VISUALS: Record<OrbState, { outerOpacity: number; innerScale: number; glowOpacity: number }> = {
  cold:    { outerOpacity: 0.40, innerScale: 0.42, glowOpacity: 0.14 },
  warming: { outerOpacity: 0.55, innerScale: 0.58, glowOpacity: 0.22 },
  running: { outerOpacity: 0.72, innerScale: 0.72, glowOpacity: 0.32 },
  deep:    { outerOpacity: 0.90, innerScale: 0.86, glowOpacity: 0.44 },
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = CARD.bg
  ctx.fillRect(0, 0, CARD.size, CARD.size)
}

async function drawNoise(ctx: CanvasRenderingContext2D): Promise<void> {
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = '/noise.png'
    })
    const pattern = ctx.createPattern(img, 'repeat')
    if (!pattern) return
    ctx.save()
    ctx.globalAlpha = CARD.noiseAlpha
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, CARD.size, CARD.size)
    ctx.restore()
  } catch {
    // Noise texture unavailable — card renders without grain, acceptable fallback
  }
}

function drawGlassCard(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(CARD.x, CARD.y, CARD.w, CARD.h, CARD.radius)
  ctx.fillStyle = CARD.cardFill
  ctx.fill()
  ctx.strokeStyle = CARD.cardBorder
  ctx.lineWidth = CARD.hairline
  ctx.stroke()
  ctx.restore()
}

function drawOrb(ctx: CanvasRenderingContext2D, orbState: OrbState, accent: string): void {
  const { outerOpacity, innerScale, glowOpacity } = ORB_VISUALS[orbState]
  const { orbCx: cx, orbCy: cy, orbR: r } = CARD
  // Use 8-digit hex for gradient stop to avoid grey bleed from color→transparent
  const accentFade = accent + '00'

  ctx.save()

  // 1. Glow — radial gradient from accent to transparent
  ctx.globalAlpha = glowOpacity
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  grad.addColorStop(0, accent)
  grad.addColorStop(0.7, accentFade)
  grad.addColorStop(1, accentFade)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  // 2. Outer ring — surface fill + subtle border
  ctx.globalAlpha = outerOpacity
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = CARD.orbSurface
  ctx.fill()
  ctx.strokeStyle = CARD.orbBorderA
  ctx.lineWidth = CARD.hairline
  ctx.stroke()

  // 3. Inner circle — dark core, scaled per state
  ctx.globalAlpha = 1
  const innerR = (r / 2) * innerScale
  ctx.beginPath()
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
  ctx.fillStyle = CARD.bg
  ctx.fill()
  ctx.strokeStyle = CARD.orbBorderS
  ctx.lineWidth = CARD.hairline
  ctx.stroke()

  ctx.restore()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines = 2): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (ctx.measureText(test).width > maxW && current) {
      lines.push(current)
      if (lines.length >= maxLines) return lines
      current = word
    } else {
      current = test
    }
  }
  if (current && lines.length < maxLines) lines.push(current)
  return lines
}

function extractFirstSentence(prose: string, maxChars = 130): string {
  const match = prose.match(/^.{20,}?[.!?](?:\s|$)/)
  const sentence = (match ? match[0] : prose).trim()
  if (sentence.length <= maxChars) return sentence
  return sentence.slice(0, maxChars).trim() + '…'
}

function drawProse(ctx: CanvasRenderingContext2D, prose: string): void {
  ctx.save()
  ctx.font = `400 ${CARD.proseFontPx}px Fraunces`
  ctx.fillStyle = CARD.textDaemon
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const text = extractFirstSentence(prose)
  const lines = wrapText(ctx, text, CARD.proseMaxW)
  lines.forEach((line, i) => {
    ctx.fillText(line, CARD.proseCx, CARD.proseY + i * CARD.proseLineH)
  })
  ctx.restore()
}

function drawSeparator(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.strokeStyle = CARD.cardBorder
  ctx.lineWidth = CARD.hairline
  ctx.beginPath()
  ctx.moveTo(CARD.x + CARD.padH, CARD.sepY)
  ctx.lineTo(CARD.x + CARD.w - CARD.padH, CARD.sepY)
  ctx.stroke()
  ctx.restore()
}

function drawProcesses(ctx: CanvasRenderingContext2D, names: string[]): void {
  if (names.length === 0) return
  ctx.save()
  ctx.font = `400 ${CARD.procFontPx}px "JetBrains Mono"`
  ctx.fillStyle = CARD.textProc
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  names.slice(0, 3).forEach((name, i) => {
    ctx.fillText(name, CARD.procX, CARD.procY + i * CARD.procLineH)
  })
  ctx.restore()
}

function drawFooter(ctx: CanvasRenderingContext2D, day: number, orbState: OrbState): void {
  ctx.save()
  ctx.font = `400 ${CARD.footFontPx}px "JetBrains Mono"`
  ctx.fillStyle = CARD.textFoot
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(`day ${day} · ${orbState}`, CARD.size / 2, CARD.footY)
  ctx.restore()
}

function drawBrand(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.font = `400 ${CARD.brandFontPx}px "JetBrains Mono"`
  ctx.fillStyle = CARD.textBrand
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('daemon code', CARD.size / 2, CARD.brandY)
  ctx.restore()
}

export interface CardInput {
  prose:        string
  day:          number
  orbState:     OrbState
  processNames: string[]  // already filtered to named only, max 3
  accent:       string    // current --accent value, e.g. '#6366f1'
}

export async function generateAndShareCard(input: CardInput): Promise<void> {
  // Ensure fonts are loaded before canvas measures or renders them
  await Promise.all([
    document.fonts.load(`400 ${CARD.proseFontPx}px Fraunces`),
    document.fonts.load(`400 ${CARD.procFontPx}px "JetBrains Mono"`),
  ])

  const canvas = document.createElement('canvas')
  canvas.width  = CARD.size
  canvas.height = CARD.size
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  drawBackground(ctx)
  await drawNoise(ctx)
  drawGlassCard(ctx)
  drawOrb(ctx, input.orbState, input.accent)
  drawProse(ctx, input.prose)
  if (input.processNames.length > 0) {
    drawSeparator(ctx)
    drawProcesses(ctx, input.processNames)
  }
  drawFooter(ctx, input.day, input.orbState)
  drawBrand(ctx)

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return

  const file = new File([blob], `daemon-${input.day}.png`, { type: 'image/png' })

  if (navigator.canShare?.({ files: [file] })) {
    // Mobile — opens native share sheet
    await navigator.share({ files: [file], title: 'daemon code' })
    return
  }

  // Desktop fallback — trigger PNG download
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = `daemon-${input.day}.png`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
