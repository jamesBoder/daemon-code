import { useEffect, useState } from 'react'
import { Stroop } from '../components/minigames/Stroop'
import type { StroopItem, StroopCue } from '../components/minigames/Stroop'
import { copy } from '../lib/copy'
import { FRAGMENT_CONTEXT_MS, LETTER_SPACING_COMPILE } from '../lib/constants'

// Dev-only playtest harness for the Phase 1 fragment batch (features-phase1.md).
// Mounted ONLY in dev builds (see App.tsx, gated by import.meta.env.DEV) — never
// bundled into production. Static content stands in for the eventual backend
// deck-builder payloads. The harness mirrors the real session flow: it shows the
// one-time fragmentContext orientation line for FRAGMENT_CONTEXT_MS before the
// game, exactly like SessionContainer does — so playtesting is representative.

// Extravagant fonts (§5d) — most words use the register default (Anton/Cormorant);
// many use loud display faces to vary the texture and the distractor.
const NOSIFER = "'Nosifer', var(--font-display)"            // dripping horror
const ABRIL  = "'Abril Fatface', var(--font-display)"      // dramatic high-contrast display (legible)
const EATER   = "'Eater', var(--font-display)"              // horror
const CINZEL  = "'Cinzel', var(--font-display)"             // engraved classical
const GLITCH  = "'Rubik Glitch', var(--font-display)"       // datamosh glitch
const BUNGEE  = "'Bungee', var(--font-display)"             // chunky block
const CINZELD = "'Cinzel Decorative', var(--font-display)" // ornate engraved caps (legible)
const MEGRIM  = "'Megrim', var(--font-display)"             // thin eerie geometric
const MONOTON = "'Monoton', var(--font-display)"            // retro lined

// The "trick": the response axis rotates. A sharp player who settles into one
// judgment gets the rug pulled. Each axis also reads a different dimension.
// Poles are ordered [positive, negative]; threat styling pressures toward the
// negative pole, calm toward the positive — an emotional distractor on every axis.
const AXES = {
  threat:  ['safe', 'dangerous'], // neuroticism
  attach:  ['keep', 'let go'],    // temporal / attachment
  trust:   ['trust', 'guard'],    // agreeableness
  pull:    ['toward', 'away'],     // approach / avoidance
  novelty: ['new', 'known'],      // openness
  duty:    ['want', 'should'],    // conscientiousness
} as const satisfies Record<string, readonly [string, string]>

// [word, axis, meaningPole index, styling, font?, cue?]. cue moves the distractor
// (§5e #2): 'color'/'type'/'motion' deliver the styling through ONE channel only,
// 'all' (default) through every channel.
type Seed = [string, keyof typeof AXES, 0 | 1, 'threat' | 'calm', string?, StroopCue?]
const SEEDS: Seed[] = [
  // threat — safe / dangerous (neuroticism)
  ['SAFE','threat',0,'threat',undefined,'color'], ['HOME','threat',0,'threat',NOSIFER,'type'], ['REST','threat',0,'calm'], ['SHELTER','threat',0,'threat',MEGRIM],
  ['DANGER','threat',1,'calm'], ['KNIFE','threat',1,'threat',undefined,'motion'], ['EDGE','threat',1,'calm',ABRIL], ['BLADE','threat',1,'threat',CINZELD,'type'],
  // attach — keep / let go (temporal / attachment)
  ['HOLD','attach',0,'threat'], ['STAY','attach',0,'threat',EATER,'type'], ['MINE','attach',0,'calm'], ['GRIP','attach',0,'threat',BUNGEE],
  ['GONE','attach',1,'calm',ABRIL], ['LEAVE','attach',1,'threat',undefined,'color'], ['RELEASE','attach',1,'calm'],
  // trust — trust / guard (agreeableness)
  ['OPEN','trust',0,'threat',undefined,'motion'], ['TRUST','trust',0,'calm'], ['WARM','trust',0,'threat',NOSIFER], ['BARE','trust',0,'threat',MEGRIM],
  ['STRANGER','trust',1,'calm'], ['LIE','trust',1,'threat',GLITCH,'type'], ['HIDDEN','trust',1,'calm',CINZEL],
  // pull — toward / away (approach / avoidance)
  ['WANT','pull',0,'threat'], ['CLOSER','pull',0,'calm',CINZEL], ['YES','pull',0,'threat',GLITCH], ['REACH','pull',0,'threat',MONOTON],
  ['RUN','pull',1,'calm'], ['NO','pull',1,'threat',undefined,'color'], ['FLINCH','pull',1,'calm'],
  // novelty — new / known (openness)
  ['FRESH','novelty',0,'threat'], ['LEAP','novelty',0,'threat',BUNGEE], ['STRANGE','novelty',0,'calm',MEGRIM],
  ['USUAL','novelty',1,'calm'], ['ROUTINE','novelty',1,'threat',CINZELD,'type'], ['AGAIN','novelty',1,'calm'],
  // duty — want / should (conscientiousness)
  ['CRAVE','duty',0,'threat',NOSIFER], ['NOW','duty',0,'threat',undefined,'motion'], ['WHIM','duty',0,'calm',ABRIL],
  ['MUST','duty',1,'calm'], ['OWED','duty',1,'threat',CINZELD,'type'], ['OUGHT','duty',1,'calm',CINZEL],
]

const WORDS: StroopItem[] = SEEDS.map(([word, axis, meaningPole, styling, font, cue]) => ({
  id: `${axis}_${word.toLowerCase()}`,
  word, axis, poles: [...AXES[axis]] as [string, string], meaningPole, styling, font, cue,
}))

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// The illusion (#3): open with a run of ONE axis so the player thinks they've got
// the game, then rotate unpredictably through all of them. Sampled from the full
// ~41-word pool each run, so replays vary (the real deck-builder will do likewise).
const LEAD_AXIS: keyof typeof AXES = 'threat'
const LEAD_COUNT = 4
const DECK_LEN   = 18
function buildDeck(): StroopItem[] {
  const lead = shuffle(WORDS.filter(w => w.axis === LEAD_AXIS)).slice(0, LEAD_COUNT)
  const leadIds = new Set(lead.map(w => w.id))
  const rest = shuffle(WORDS.filter(w => !leadIds.has(w.id))).slice(0, DECK_LEN - lead.length)
  return [...lead, ...rest]
}

type GameKey = 'stroop'

const GAMES: { key: GameKey; label: string }[] = [
  { key: 'stroop', label: 'The Stroop Variant' },
]

type Phase = 'menu' | 'context' | 'game'

export function DevGames() {
  const [active,  setActive]  = useState<GameKey | null>(null)
  const [phase,   setPhase]   = useState<Phase>('menu')
  const [result,  setResult]  = useState<unknown>(null)
  const [runId,   setRunId]   = useState(0) // remount the game on replay
  const [deck,    setDeck]    = useState<StroopItem[]>(buildDeck) // rebuilt per run
  // Force motion on regardless of the OS prefers-reduced-motion setting, so the
  // full experience can be evaluated even on a reduced-motion dev machine.
  const [forceMotion, setForceMotion] = useState(true)

  // Context phase → game, mirroring SessionContainer's orientation beat.
  useEffect(() => {
    if (phase !== 'context') return
    const t = setTimeout(() => setPhase('game'), FRAGMENT_CONTEXT_MS)
    return () => clearTimeout(t)
  }, [phase, runId])

  function start(key: GameKey) {
    setResult(null)
    setDeck(buildDeck())
    setRunId(n => n + 1)
    setActive(key)
    setPhase('context')
  }

  function handleComplete(data: unknown) {
    setResult(data)
    setActive(null)
    setPhase('menu')
  }

  function exitToMenu() {
    setActive(null)
    setPhase('menu')
  }

  // Dev convenience: Escape bails out of an in-progress game back to the menu.
  // (The real session exposes a session-level exit via SessionContainer chrome.)
  useEffect(() => {
    if (phase === 'menu') return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exitToMenu() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  // Orientation line — same look as SessionContainer (mono, compile-green).
  if (phase === 'context' && active) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-8)', pointerEvents: 'none',
      }}>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono)',
          color: 'var(--compile-green)', letterSpacing: LETTER_SPACING_COMPILE,
          textAlign: 'center',
        }}>
          {copy.fragmentContext[active] ?? ''}
        </p>
      </div>
    )
  }

  if (phase === 'game' && active === 'stroop') {
    return (
      <>
        <Stroop key={runId} items={deck} onComplete={handleComplete} forceMotion={forceMotion} />
        <button
          onClick={exitToMenu}
          style={{
            position: 'fixed', top: 'calc(env(safe-area-inset-top) + 12px)', right: 12, zIndex: 50,
            background: 'transparent', border: '1px solid var(--border-active)', borderRadius: 'var(--radius-md)',
            padding: '6px 12px', color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', cursor: 'pointer',
          }}
        >
          ✕ menu
        </button>
      </>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, overflowY: 'auto',
      padding: 'var(--space-12) var(--space-5)',
      fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          dev · fragment playtest
        </p>

        <button
          onClick={() => setForceMotion(v => !v)}
          style={{
            textAlign: 'left', padding: 'var(--space-3) var(--space-4)',
            background: 'transparent', border: '1px solid var(--border-active)', borderRadius: 'var(--radius-md)',
            color: forceMotion ? 'var(--compile-green)' : 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', cursor: 'pointer',
          }}
        >
          force motion: {forceMotion ? 'ON' : 'off'} {forceMotion ? '' : '(honoring OS reduced-motion)'}
        </button>

        {GAMES.map(g => (
          <button
            key={g.key}
            onClick={() => start(g.key)}
            style={{
              textAlign: 'left',
              padding: 'var(--space-4) var(--space-5)',
              background: 'transparent',
              border: '1px solid var(--border-active)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
              cursor: 'pointer',
            }}
          >
            {g.label} →
          </button>
        ))}

        {result !== null && (
          <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {'// response_data captured (dev only — players never see this; the real session just advances)'}
            </p>
            <pre style={{
              margin: 0, padding: 'var(--space-4)',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-xs)', color: 'var(--compile-green)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
