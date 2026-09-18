import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { ConsoleShell } from '../../components/console/ConsoleShell'
import { Portrait } from '../../components/portrait/Portrait'
import { DaemonOrb } from '../../components/daemon/DaemonOrb'
import { SignalWhisper } from '../../components/daemon/SignalWhisper'
import { apiFetchJson, fetchSelf } from '../../lib/api'
import { BUTTON_TAP_OPACITY, BUTTON_TAP_SCALE, LETTER_SPACING_WIDE, MAX_CONTENT_WIDTH, MIN_TOUCH_TARGET } from '../../lib/constants'
import { copy } from '../../lib/copy'
import type { ChronicleEntry, Process, ProcessState } from '../../types'

// SELF's real layout (docs/simplify-pass.md, "Frontend spec: SELF tab") —
// small, not a dossier: image + archetype + stage line + capped patterns +
// capped recent takeaways. Ported from the old Self.tsx (same Portrait,
// same pattern-fetch/sort logic) rather than rebuilt from scratch, with
// three changes: archetype label rotates between softened names instead of
// one fixed clinical-sounding one, the pattern list is capped instead of
// showing every named pattern, and a new capped "recent" section folds in
// Chronicle takeaways instead of linking out to a full log.
const SELF = {
  portraitSize: 300,   // px — square canvas edge (capped to viewport by Portrait)
  stateMaxW:    300,   // px — copy column width for empty / read lines
  fadeS:        0.6,   // s — portrait reveal
  patternCap:   3,      // "what it carries" — strongest/most-recent shown, no scrollable list
  takeawayCap:  2,      // "recent" — last entry or two, never the full log
} as const

// Display order for the folded patterns — what moves sits above what sleeps.
const PATTERN_ORDER: Record<ProcessState, number> = {
  running:   0,
  new:       1,
  weakening: 2,
  sleeping:  3,
}

// Deterministic per compileCount, not random-per-render — same principle as
// the Narrator's own lens rotation. A name that changed every time you
// looked at the screen would read as broken, not intentional.
function pickArchetypeLabel(archetype: string, compileCount: number): string {
  const pair = copy.self.archetypeNamePairs[archetype] ?? copy.self.archetypeNamePairs.default
  return pair[compileCount % pair.length]
}

export function SelfTab() {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['self'],
    queryFn: fetchSelf,
    staleTime: 5 * 60 * 1000,
  })

  // The patterns the daemon carries — folded under the Portrait as language,
  // never bars or numbers. Best-effort: a miss just hides the section.
  const { data: processes = [] } = useQuery({
    queryKey: ['processes'],
    queryFn: () => apiFetchJson<Process[]>('/processes'),
    staleTime: 5 * 60 * 1000,
  })

  // Recent takeaways — folded-in Chronicle, capped, short lines only.
  const { data: chronicle = [] } = useQuery({
    queryKey: ['chronicle'],
    queryFn: () => apiFetchJson<ChronicleEntry[]>('/chronicle'),
    staleTime: 5 * 60 * 1000,
  })

  const named = processes
    .filter(p => !p.unnamed && p.name)
    .sort((a, b) => (PATTERN_ORDER[a.state] ?? PATTERN_ORDER.sleeping) - (PATTERN_ORDER[b.state] ?? PATTERN_ORDER.sleeping))
    .slice(0, SELF.patternCap)
  const hasForming = processes.some(p => p.unnamed)

  const takeaways = chronicle
    .filter(e => e.takeaway)
    .slice(0, SELF.takeawayCap)

  // Guard against a null dimensions field (defensive — backend now sends {}).
  const hasRead = !!data && Object.keys(data.dimensions ?? {}).length > 0

  return (
    <ConsoleShell active="self">
      <div
        style={{
          padding: 'var(--space-6) var(--space-5) var(--space-8)',
          maxWidth: MAX_CONTENT_WIDTH,
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 'var(--space-16)', gap: 'var(--space-4)' }}>
            <DaemonOrb state="cold" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE }}>
              reading
            </span>
          </div>
        ) : isError || !data ? (
          <div style={{ paddingTop: 'var(--space-16)', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-muted)', maxWidth: SELF.stateMaxW, margin: '0 auto' }}>
              Could not load your read.<br />
              Check your connection and try again.
            </p>
            <motion.button
              onClick={() => refetch()}
              disabled={isFetching}
              whileTap={isFetching ? {} : { scale: BUTTON_TAP_SCALE, opacity: BUTTON_TAP_OPACITY }}
              style={{ background: 'none', border: 'none', cursor: isFetching ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE, marginTop: 'var(--space-4)', minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, padding: 'var(--space-3) var(--space-4)', opacity: isFetching ? 0.4 : 1 }}
            >
              {isFetching ? '···' : 'retry'}
            </motion.button>
          </div>
        ) : !hasRead ? (
          // Real bug found 2026-09-18: textAlign:'center' (ported verbatim
          // from the old Self.tsx) does nothing for DaemonOrb — it renders a
          // fixed-width block motion.div with no auto margins, and
          // text-align only affects inline content. Proper flex centering,
          // matching what Play.tsx's idle state already does correctly.
          <div style={{ paddingTop: 'var(--space-12)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <DaemonOrb state="cold" />
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', lineHeight: 'var(--leading-xl)', color: 'var(--text-primary)', maxWidth: SELF.stateMaxW, margin: 'var(--space-6) auto 0' }}>
              {copy.self.emptyTitle}<br />
              <span style={{ color: 'var(--text-muted)' }}>{copy.self.emptyBody}</span>
            </p>
          </div>
        ) : (
          <>
            <SignalWhisper hintKey="self_first" text={copy.signalHints.self_first} condition={hasRead} />

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: SELF.fadeS }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-5)', paddingTop: 'var(--space-4)' }}
            >
              <Portrait read={data} size={SELF.portraitSize} />

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE, textTransform: 'uppercase' }}>
                  {copy.self.archetypeIntro}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--accent)', marginTop: 'var(--space-2)' }}>
                  {pickArchetypeLabel(data.archetype, data.compileCount)}
                </div>
              </div>

              <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', lineHeight: 'var(--leading-lg)', color: 'var(--text-secondary)', maxWidth: SELF.stateMaxW, textAlign: 'center', margin: 0 }}>
                {copy.self.stageLines[data.stage] ?? copy.self.stageLines.cold}
              </p>

              {(named.length > 0 || hasForming) && (
                <div style={{ width: '100%', marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE, textTransform: 'uppercase', textAlign: 'center' }}>
                    {copy.self.patternsTitle}
                  </span>

                  <SignalWhisper hintKey="patterns_first" text={copy.signalHints.patterns_first} condition={named.length > 0} />

                  {named.map(p => (
                    <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontStyle: 'italic', flexShrink: 0 }}>
                          {copy.self.patternsStateLines[p.state] ?? copy.self.patternsStateLines.sleeping}
                        </span>
                      </div>
                      {p.daemon_note && (
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', lineHeight: 'var(--leading-base)', color: 'var(--text-secondary)', margin: 0 }}>
                          {p.daemon_note}
                        </p>
                      )}
                    </div>
                  ))}

                  {hasForming && (
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', lineHeight: 'var(--leading-xs)', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0, textAlign: 'center' }}>
                      {copy.self.patternsForming}
                    </p>
                  )}
                </div>
              )}

              {takeaways.length > 0 && (
                <div style={{ width: '100%', marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: LETTER_SPACING_WIDE, textTransform: 'uppercase', textAlign: 'center' }}>
                    {copy.self.takeawaysTitle}
                  </span>
                  {takeaways.map(e => (
                    <p key={e.date} style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', lineHeight: 'var(--leading-base)', fontStyle: 'italic', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
                      &ldquo;{e.takeaway}&rdquo;
                    </p>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </div>
    </ConsoleShell>
  )
}
