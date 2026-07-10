import { SHARE_CARD_SIZE, STREAK_MIN_DAYS } from './constants'
import type { OrbState } from '../types'

// All card geometry for the 1080×1080 shareable card.
// Every layout value lives here — nothing bare in the draw functions.
const S = SHARE_CARD_SIZE  // 1080

const CARD = {
  size:         S,
  // Glass card frame
  w:            880,
  h:            880,
  x:            (S - 880) / 2,               // 100
  y:            72,
  radius:       28,
  padH:         64,                           // horizontal padding inside card
  // Accent glow behind orb
  glowR:        300,
  glowAlpha:    0.08,
  // Orb
  orbR:         64,
  orbCx:        S / 2,                        // 540
  orbCy:        72 + 128,                     // 200
  // Status line (day · stage · streak)
  statusFontPx: 22,
  statusY:      296,
  // Prose (Fraunces italic)
  proseFontPx:  36,
  proseLineH:   52,
  proseMaxLines:3,
  proseMaxChars:200,
  proseCx:      S / 2,
  proseY:       352,
  proseMaxW:    880 - 64 * 2,                 // 752
  // Separators
  sep1Y:        548,
  sep2Y:        726,
  // Behavioral index triad
  triadLabelPx: 18,
  triadLabelY:  584,
  triadValuePx: 48,
  triadValueY:  616,
  triadDeltaPx: 20,
  triadDeltaY:  682,
  // column centers: content split into thirds
  triadCols:    [1 / 6, 3 / 6, 5 / 6],
  // Daily signal quote
  quoteFontPx:  26,
  quoteLineH:   38,
  quoteMaxLines:2,
  quoteY:       788,
  authorFontPx: 20,
  // Footer (compile complete.)
  footFontPx:   22,
  footY:        905,
  // Brand mark
  brandFontPx:  22,
  brandY:       S - 84,                       // 996
  // Design tokens — canvas equivalents of CSS custom properties
  bg:           '#070809',
  cardFill:     'rgba(13, 16, 24, 0.78)',
  cardBorder:   'rgba(255, 255, 255, 0.06)',
  textPrimary:  '#e2e8f0',
  textDaemon:   '#c4c9d4',
  textMuted:    '#64748b',
  textFoot:     '#475569',
  green:        '#22c55e',                    // --compile-green
  warn:         '#f59e0b',                    // --warning
  orbSurface:   '#0d1018',
  orbBorderA:   'rgba(255, 255, 255, 0.12)',  // border-active equivalent
  orbBorderS:   'rgba(255, 255, 255, 0.03)',  // border-subtle equivalent
  noiseAlpha:   0.04,
  hairline:     0.5,                          // canvas lineWidth for all border strokes
  letterSpacing:'1.5px',                      // mono labels — canvas equivalent of 0.06em
} as const

// Mirrors DaemonOrb.tsx orbVisuals — must stay in sync if that component changes
const ORB_VISUALS: Record<OrbState, { outerOpacity: number; innerScale: number; glowOpacity: number }> = {
  cold:    { outerOpacity: 0.40, innerScale: 0.42, glowOpacity: 0.14 },
  warming: { outerOpacity: 0.55, innerScale: 0.58, glowOpacity: 0.22 },
  running: { outerOpacity: 0.72, innerScale: 0.72, glowOpacity: 0.32 },
  deep:    { outerOpacity: 0.90, innerScale: 0.86, glowOpacity: 0.44 },
}

const FONT = {
  prose:   `italic 300 ${CARD.proseFontPx}px Fraunces`,
  quote:   `italic 300 ${CARD.quoteFontPx}px Fraunces`,
  mono:    (px: number) => `400 ${px}px "JetBrains Mono"`,
  monoMed: (px: number) => `500 ${px}px "JetBrains Mono"`,
} as const

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  // letterSpacing is recent canvas API — silently ignored where unsupported
  if ('letterSpacing' in ctx) ctx.letterSpacing = value
}

function drawBackground(ctx: CanvasRenderingContext2D, accent: string): void {
  ctx.fillStyle = CARD.bg
  ctx.fillRect(0, 0, CARD.size, CARD.size)

  // Accent wash radiating from the orb — ties the card to the user's archetype color
  ctx.save()
  ctx.globalAlpha = CARD.glowAlpha
  const grad = ctx.createRadialGradient(CARD.orbCx, CARD.orbCy, 0, CARD.orbCx, CARD.orbCy, CARD.glowR)
  grad.addColorStop(0, accent)
  grad.addColorStop(1, accent + '00')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, CARD.size, CARD.size)
  ctx.restore()
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

function drawStatusLine(ctx: CanvasRenderingContext2D, day: number, orbState: OrbState, consecutiveDays: number): void {
  const parts = [`day ${day}`, orbState]
  if (consecutiveDays >= STREAK_MIN_DAYS) parts.push(`${consecutiveDays}-day streak`)
  ctx.save()
  ctx.font = FONT.mono(CARD.statusFontPx)
  setLetterSpacing(ctx, CARD.letterSpacing)
  ctx.fillStyle = CARD.textMuted
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(parts.join('  ·  '), CARD.size / 2, CARD.statusY)
  ctx.restore()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
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

function extractExcerpt(prose: string, maxChars: number): string {
  const match = prose.match(/^.{20,}?[.!?](?:\s|$)/)
  const sentence = (match ? match[0] : prose).trim()
  if (sentence.length <= maxChars) return sentence
  return sentence.slice(0, maxChars).trim() + '…'
}

function drawProse(ctx: CanvasRenderingContext2D, prose: string): void {
  ctx.save()
  ctx.font = FONT.prose
  ctx.fillStyle = CARD.textDaemon
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const text = `“${extractExcerpt(prose, CARD.proseMaxChars)}”`
  const lines = wrapText(ctx, text, CARD.proseMaxW, CARD.proseMaxLines)
  lines.forEach((line, i) => {
    ctx.fillText(line, CARD.proseCx, CARD.proseY + i * CARD.proseLineH)
  })
  ctx.restore()
}

function drawSeparator(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.save()
  ctx.strokeStyle = CARD.cardBorder
  ctx.lineWidth = CARD.hairline
  ctx.beginPath()
  ctx.moveTo(CARD.x + CARD.padH, y)
  ctx.lineTo(CARD.x + CARD.w - CARD.padH, y)
  ctx.stroke()
  ctx.restore()
}

interface TriadStat {
  label:  string
  value:  string
  delta:  number
}

function drawTriad(ctx: CanvasRenderingContext2D, stats: TriadStat[]): void {
  const contentX = CARD.x + CARD.padH
  const contentW = CARD.w - CARD.padH * 2
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  stats.forEach((stat, i) => {
    const cx = contentX + contentW * CARD.triadCols[i]
    ctx.font = FONT.mono(CARD.triadLabelPx)
    setLetterSpacing(ctx, CARD.letterSpacing)
    ctx.fillStyle = CARD.textMuted
    ctx.fillText(stat.label, cx, CARD.triadLabelY)
    setLetterSpacing(ctx, '0px')

    ctx.font = FONT.monoMed(CARD.triadValuePx)
    ctx.fillStyle = CARD.textPrimary
    ctx.fillText(stat.value, cx, CARD.triadValueY)

    if (stat.delta !== 0) {
      ctx.font = FONT.mono(CARD.triadDeltaPx)
      ctx.fillStyle = stat.delta > 0 ? CARD.green : CARD.warn
      ctx.fillText(`${stat.delta > 0 ? '+' : ''}${stat.delta}`, cx, CARD.triadDeltaY)
    }
  })
  ctx.restore()
}

// The daily signal quote — the block between the triad and the footer
function drawSignal(ctx: CanvasRenderingContext2D, quote: string, author?: string): void {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = FONT.quote
  ctx.fillStyle = CARD.textMuted
  const lines = wrapText(ctx, `“${quote}”`, CARD.proseMaxW, CARD.quoteMaxLines)
  lines.forEach((line, i) => {
    ctx.fillText(line, CARD.size / 2, CARD.quoteY + i * CARD.quoteLineH)
  })
  if (author) {
    ctx.font = FONT.mono(CARD.authorFontPx)
    ctx.fillStyle = CARD.textFoot
    ctx.fillText(`— ${author}`, CARD.size / 2, CARD.quoteY + lines.length * CARD.quoteLineH + CARD.quoteLineH / 2)
  }
  ctx.restore()
}

function drawFooter(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.font = FONT.mono(CARD.footFontPx)
  setLetterSpacing(ctx, CARD.letterSpacing)
  ctx.fillStyle = CARD.green
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('compile complete. ▋', CARD.size / 2, CARD.footY)
  ctx.restore()
}

function drawBrand(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.font = FONT.mono(CARD.brandFontPx)
  setLetterSpacing(ctx, CARD.letterSpacing)
  ctx.fillStyle = CARD.textFoot
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('daemoncode.app', CARD.size / 2, CARD.brandY)
  ctx.restore()
}

export interface CardInput {
  prose:               string
  day:                 number
  orbState:            OrbState
  accent:              string          // current --accent value, e.g. '#6366f1'
  kernelAccess:        number
  daemonAccuracy:      number
  decodedLines:        number
  kernelAccessDelta:   number
  daemonAccuracyDelta: number
  decodedLinesDelta:   number
  consecutiveDays:     number
  signalQuote?:        string
  signalAuthor?:       string
}

export async function generateAndShareCard(input: CardInput): Promise<void> {
  // Ensure fonts are loaded before canvas measures or renders them
  await Promise.all([
    document.fonts.load(FONT.prose),
    document.fonts.load(FONT.mono(CARD.authorFontPx)),
    document.fonts.load(FONT.monoMed(CARD.triadValuePx)),
  ])

  const canvas = document.createElement('canvas')
  canvas.width  = CARD.size
  canvas.height = CARD.size
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  drawBackground(ctx, input.accent)
  await drawNoise(ctx)
  drawGlassCard(ctx)
  drawOrb(ctx, input.orbState, input.accent)
  drawStatusLine(ctx, input.day, input.orbState, input.consecutiveDays)
  drawProse(ctx, input.prose)
  drawSeparator(ctx, CARD.sep1Y)
  drawTriad(ctx, [
    { label: 'kernel access',   value: `${input.kernelAccess}%`,            delta: input.kernelAccessDelta },
    { label: 'daemon accuracy', value: `${input.daemonAccuracy}%`,          delta: input.daemonAccuracyDelta },
    { label: 'decoded lines',   value: input.decodedLines.toLocaleString(), delta: input.decodedLinesDelta },
  ])
  drawSeparator(ctx, CARD.sep2Y)
  if (input.signalQuote) {
    drawSignal(ctx, input.signalQuote, input.signalAuthor)
  }
  drawFooter(ctx)
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
