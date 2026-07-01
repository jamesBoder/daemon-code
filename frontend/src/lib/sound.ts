// Web Audio atmosphere (§7) — procedural UI sounds + a signal-reactive ambient drone.
//
// Mirrors the gated-module idiom of lib/haptics.ts: a single exported play
// function that no-ops unless the user has opted in (SOUND_KEY). Nothing here
// loads an asset — the four UI sounds and the ambient bed are synthesized at
// runtime with Web Audio oscillators, so there is no AWS dependency and no
// network cost. The ambient drone runs through a low-pass BiquadFilterNode
// whose cutoff is driven by the daemon's signal confidence (see roadmap
// "The lantern metaphor made audible").
//
// Browser autoplay policy: an AudioContext starts suspended and can only run
// after a user gesture. We arm a one-shot gesture listener to resume it (covers
// iOS, where playback from a non-gesture callback — e.g. the compile timeline or
// the session-complete mount — would otherwise be silently blocked), and we
// suspend/resume around tab visibility to save battery and recover from iOS
// audio interruptions (phone call, another app taking the audio session).

import { SOUND_KEY } from './constants'

/** Every audio recipe value lives here — no bare numbers in the synthesis code. */
const SOUND = {
  // Envelope primitives shared by every one-shot
  silenceFloor: 0.0001, // exponential ramps can't reach 0 — floor everything here
  attackS:      0.008,  // fast attack to peak level
  stopTailS:    0.02,   // extra time before osc.stop() so the release isn't clipped

  // Master levels (kept low — atmosphere, not foreground)
  uiLevel:      0.18,   // peak gain for one-shot UI sounds
  chordVoiceMix: 0.5,   // per-voice level for the 4-note chord (stack would clip at full)
  completeVoiceMix: 0.7,// per-voice level for the 2-note ascending acknowledgment
  ambientLevel: 0.08,   // peak gain for the ambient bed (roadmap: "fades in at 8%")
  ambientFadeS: 4.0,    // ramp time for ambient start/stop

  // UI sound: compile line appears — "soft click" (sine, 1200Hz, ~20ms)
  click:   { freq: 1200, durS: 0.05, type: 'sine'     as OscillatorType },
  // UI sound: orb compile_pulse — "deep resonant pulse" (80Hz + 160Hz overtone, 600ms)
  pulse:   { freq: 80, overtone: 160, overtoneLevel: 0.4, durS: 0.6, type: 'sine' as OscillatorType },
  // UI sound: process named — "resolution chord" (Dm7, soft release, 400ms)
  chord:   { freqs: [146.83, 174.61, 220.0, 261.63], durS: 0.5, type: 'sine' as OscillatorType }, // D3 F3 A3 C4
  // UI sound: session complete — "subtle acknowledgment" (G→B ascending, 200ms each)
  complete:{ freqs: [392.0, 493.88], stepS: 0.12, durS: 0.18, type: 'sine' as OscillatorType }, // G4 → B4

  // Ambient drone: two detuned low oscillators + the low-pass sweep
  drone:   { baseFreq: 55, detuneCents: 7, type: 'triangle' as OscillatorType }, // A1, slightly detuned pair
  // Low-pass cutoff maps from signal confidence: 0.0 → muffled, 1.0 → present
  filterMinHz:  200,
  filterRangeHz: 3800,  // cutoff = filterMinHz + confidence * filterRangeHz
  filterRampS:  3.0,    // glide time when confidence changes (roadmap: 3.0s)
  filterQ:      1.2,

  // The Hold's own tone — a fragment-scoped low pad (NOT the global ambient bed),
  // started and stopped by the void itself. A felt, calm fundamental + a soft
  // fifth; its level and low-pass cutoff open as the user settles (the lantern
  // metaphor made audible — stillness clarifies the sound, like the grain clears).
  hold: {
    rootHz:        52,    // a low, felt fundamental
    fifthHz:       78,    // a soft fifth above → an open, calm interval
    detuneCents:   6,     // slight detune → a living shimmer
    type:          'triangle' as OscillatorType,
    level:         0.06,  // peak gain at full stillness (very low — felt, not heard)
    fadeS:         2.5,   // start / stop ramp
    cutoffMinHz:   180,   // low-pass cutoff at zero stillness (muffled)
    cutoffRangeHz: 1600,  // …opens this much as you settle
    rampS:         0.4,   // glide for level / cutoff updates
    releaseHz:     196,   // a soft exhale tone on commit (G3)
  },
} as const

// ── Shared context (lazy, gesture-bootstrapped) ───────────────────────────────

let ctx: AudioContext | null = null
let lifecycleArmed = false

/** Returns the shared context, creating/resuming it. Returns null if Web Audio
 *  is unavailable (older browsers). Safe to call outside a gesture, but the
 *  context only leaves "suspended" once a gesture has occurred. */
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) {
    ctx = new AC()
    armLifecycle()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Wire one-shot gesture-unlock + tab-visibility handling. Attached once, the
 *  first time a context exists. */
function armLifecycle() {
  if (lifecycleArmed || typeof window === 'undefined') return
  lifecycleArmed = true

  // Autoplay unlock: resume on the first user gesture, then detach.
  const unlock = () => {
    if (ctx && ctx.state !== 'running') void ctx.resume()
    ;['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
      window.removeEventListener(ev, unlock))
  }
  ;['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, unlock, { passive: true }))

  // Battery + interruption recovery: pause when backgrounded, resume when
  // foregrounded (only if the user still has sound on).
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (document.hidden) {
      if (ctx.state === 'running') void ctx.suspend()
    } else if (isSoundEnabled() && ctx.state !== 'running') {
      void ctx.resume()
    }
  })
}

export function isSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_KEY) === 'true'
}

// ── One-shot UI sounds ────────────────────────────────────────────────────────

export type SoundName = 'click' | 'pulse' | 'chord' | 'complete'

/** Schedules a single oscillator with a fast attack + exponential release. */
function ping(c: AudioContext, freq: number, type: OscillatorType, durS: number, level: number, startAt: number) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, startAt)
  gain.gain.setValueAtTime(SOUND.silenceFloor, startAt)
  gain.gain.exponentialRampToValueAtTime(level, startAt + SOUND.attackS)
  gain.gain.exponentialRampToValueAtTime(SOUND.silenceFloor, startAt + durS)
  osc.connect(gain).connect(c.destination)
  osc.start(startAt)
  osc.stop(startAt + durS + SOUND.stopTailS)
}

/** Play one of the four procedural UI sounds. No-ops unless sound is enabled.
 *  Fire-and-forget — same contract as haptic(). */
export function playSound(name: SoundName) {
  if (!isSoundEnabled()) return
  const c = audio()
  if (!c) return
  const t = c.currentTime

  switch (name) {
    case 'click':
      ping(c, SOUND.click.freq, SOUND.click.type, SOUND.click.durS, SOUND.uiLevel, t)
      break
    case 'pulse':
      ping(c, SOUND.pulse.freq, SOUND.pulse.type, SOUND.pulse.durS, SOUND.uiLevel, t)
      ping(c, SOUND.pulse.overtone, SOUND.pulse.type, SOUND.pulse.durS, SOUND.uiLevel * SOUND.pulse.overtoneLevel, t)
      break
    case 'chord':
      // Soft simultaneous triad — lower per-voice level so the stack doesn't clip.
      SOUND.chord.freqs.forEach(f => ping(c, f, SOUND.chord.type, SOUND.chord.durS, SOUND.uiLevel * SOUND.chordVoiceMix, t))
      break
    case 'complete':
      SOUND.complete.freqs.forEach((f, i) =>
        ping(c, f, SOUND.complete.type, SOUND.complete.durS, SOUND.uiLevel * SOUND.completeVoiceMix, t + i * SOUND.complete.stepS))
      break
  }
}

// ── Ambient drone (signal-reactive low-pass) ──────────────────────────────────

interface Ambient {
  osc1: OscillatorNode
  osc2: OscillatorNode
  filter: BiquadFilterNode
  gain: GainNode
}
let ambient: Ambient | null = null

function confidenceToCutoff(confidence: number): number {
  const clamped = Math.max(0, Math.min(1, confidence))
  return SOUND.filterMinHz + clamped * SOUND.filterRangeHz
}

/** Start the ambient bed (idempotent). No-ops unless sound is enabled.
 *  `confidence` (0–1) sets the initial low-pass cutoff. */
export function startAmbient(confidence: number) {
  if (!isSoundEnabled() || ambient) return
  const c = audio()
  if (!c) return
  const t = c.currentTime

  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(confidenceToCutoff(confidence), t)
  filter.Q.value = SOUND.filterQ

  const gain = c.createGain()
  gain.gain.setValueAtTime(SOUND.silenceFloor, t)
  gain.gain.exponentialRampToValueAtTime(SOUND.ambientLevel, t + SOUND.ambientFadeS)

  const osc1 = c.createOscillator()
  const osc2 = c.createOscillator()
  osc1.type = osc2.type = SOUND.drone.type
  osc1.frequency.setValueAtTime(SOUND.drone.baseFreq, t)
  osc2.frequency.setValueAtTime(SOUND.drone.baseFreq, t)
  osc2.detune.setValueAtTime(SOUND.drone.detuneCents, t) // beat against osc1 → slow shimmer

  osc1.connect(filter)
  osc2.connect(filter)
  filter.connect(gain).connect(c.destination)
  osc1.start(t)
  osc2.start(t)

  ambient = { osc1, osc2, filter, gain }
}

/** Glide the ambient low-pass cutoff toward the new confidence over filterRampS.
 *  No-op if the ambient bed isn't running. */
export function setAmbientConfidence(confidence: number) {
  if (!ambient) return
  const c = audio()
  if (!c) return
  ambient.filter.frequency.exponentialRampToValueAtTime(
    confidenceToCutoff(confidence),
    c.currentTime + SOUND.filterRampS,
  )
}

/** Fade out and tear down the ambient bed. */
export function stopAmbient() {
  if (!ambient) return
  const c = audio()
  const { osc1, osc2, gain } = ambient
  if (c) {
    const t = c.currentTime
    gain.gain.cancelScheduledValues(t)
    gain.gain.setValueAtTime(Math.max(gain.gain.value, SOUND.silenceFloor), t)
    gain.gain.exponentialRampToValueAtTime(SOUND.silenceFloor, t + SOUND.ambientFadeS)
    osc1.stop(t + SOUND.ambientFadeS + SOUND.stopTailS)
    osc2.stop(t + SOUND.ambientFadeS + SOUND.stopTailS)
  } else {
    osc1.stop(); osc2.stop()
  }
  ambient = null
}

// ── The Hold's fragment-scoped tone ───────────────────────────────────────────

let holdTone: { osc1: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null

/** Start the Hold's low pad (idempotent). No-ops unless sound is enabled. Level
 *  and cutoff start muffled; setHoldTone opens them as the user settles. */
export function startHoldTone() {
  if (!isSoundEnabled() || holdTone) return
  const c = audio()
  if (!c) return
  const t = c.currentTime
  const H = SOUND.hold

  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(H.cutoffMinHz, t)
  filter.Q.value = SOUND.filterQ

  const gain = c.createGain()
  gain.gain.setValueAtTime(SOUND.silenceFloor, t) // setHoldTone ramps this with stillness

  const osc1 = c.createOscillator()
  const osc2 = c.createOscillator()
  osc1.type = osc2.type = H.type
  osc1.frequency.setValueAtTime(H.rootHz, t)
  osc2.frequency.setValueAtTime(H.fifthHz, t)
  osc2.detune.setValueAtTime(H.detuneCents, t) // slow shimmer against osc1

  osc1.connect(filter)
  osc2.connect(filter)
  filter.connect(gain).connect(c.destination)
  osc1.start(t)
  osc2.start(t)

  holdTone = { osc1, osc2, filter, gain }
}

/** Drive the Hold tone from stillness (0..1): louder + brighter as you settle. */
export function setHoldTone(stillness: number) {
  if (!holdTone) return
  const c = audio()
  if (!c) return
  const H = SOUND.hold
  const t = c.currentTime
  const s = Math.max(0, Math.min(1, stillness))
  const level = Math.max(SOUND.silenceFloor, H.level * s)
  holdTone.gain.gain.cancelScheduledValues(t)
  holdTone.gain.gain.setValueAtTime(Math.max(holdTone.gain.gain.value, SOUND.silenceFloor), t)
  holdTone.gain.gain.exponentialRampToValueAtTime(level, t + H.rampS)
  holdTone.filter.frequency.exponentialRampToValueAtTime(H.cutoffMinHz + s * H.cutoffRangeHz, t + H.rampS)
}

/** A soft exhale tone when the user commits to leaving. No-ops unless enabled. */
export function playHoldRelease() {
  if (!isSoundEnabled()) return
  const c = audio()
  if (!c) return
  ping(c, SOUND.hold.releaseHz, SOUND.hold.type, SOUND.hold.fadeS * 0.2, SOUND.uiLevel * 0.5, c.currentTime)
}

/** Fade out and tear down the Hold tone. */
export function stopHoldTone() {
  if (!holdTone) return
  const c = audio()
  const { osc1, osc2, gain } = holdTone
  if (c) {
    const t = c.currentTime
    gain.gain.cancelScheduledValues(t)
    gain.gain.setValueAtTime(Math.max(gain.gain.value, SOUND.silenceFloor), t)
    gain.gain.exponentialRampToValueAtTime(SOUND.silenceFloor, t + SOUND.hold.fadeS)
    osc1.stop(t + SOUND.hold.fadeS + SOUND.stopTailS)
    osc2.stop(t + SOUND.hold.fadeS + SOUND.stopTailS)
  } else {
    osc1.stop(); osc2.stop()
  }
  holdTone = null
}
