import { useEffect, useState } from 'react'
import { useCompileAnimation } from '../../hooks/useCompileAnimation'
import { DaemonOrb } from './DaemonOrb'
import { DaemonProse } from './DaemonProse'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { copy } from '../../lib/copy'
import { COMPILE_AUTOPLAY_DELAY, LETTER_SPACING_TIGHT, MAX_CONTENT_WIDTH, PROSE_MAX_WIDTH } from '../../lib/constants'
import type { CompileData } from '../../types'

interface CompileScreenProps {
  data:          CompileData
  autoPlay?:     boolean
  audioUrl?:     string
  audioPlaying?: boolean
  onMicClick?:   () => void
}

export function CompileScreen({ data, autoPlay = true, audioUrl, audioPlaying, onMicClick }: CompileScreenProps) {
  const { containerRef, play } = useCompileAnimation()
  const reduced = useReducedMotion()
  const [orbPulsing, setOrbPulsing] = useState(false)

  useEffect(() => {
    if (autoPlay) {
      const delay = reduced ? 0 : COMPILE_AUTOPLAY_DELAY
      const t = setTimeout(
        () => play(() => setOrbPulsing(true)),
        delay
      )
      return () => clearTimeout(t)
    }
  }, [autoPlay, play, reduced])

  const baseLines    = copy.compile.lines(data.processingSignals, data.analystTime)
  const streakLine   = copy.compile.streakLine(data.consecutiveDays, data.day)
  const compileLines = streakLine ? [...baseLines, streakLine] : baseLines

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-8)',
        padding: 'var(--space-8) var(--space-5)',
        maxWidth: MAX_CONTENT_WIDTH,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Terminal lines */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {compileLines.map((line, i) => (
          <p
            key={i}
            data-compile-line
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-mono)',
              lineHeight: 'var(--leading-mono)',
              color: 'var(--text-muted)',
              letterSpacing: '0.05em',
              opacity: 0,
            }}
          >
            {line}
          </p>
        ))}

        {/* Compile complete header */}
        <div data-compile-line style={{ opacity: 0 }}>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-mono)',
            lineHeight: 'var(--leading-mono)',
            color: 'var(--compile-green)',
            letterSpacing: '0.05em',
            marginTop: 'var(--space-2)',
          }}>
            {copy.compile.complete}
          </p>
          <div style={{ height: '0.5px', background: 'var(--border)', margin: 'var(--space-2) 0' }} />
        </div>

        {/* Stats */}
        {data.stats.map((stat, i) => {
          const deltaColor = stat.delta !== undefined
            ? (stat.delta >= 0 ? 'var(--compile-green)' : 'var(--warning)')
            : undefined
          const deltaSign = stat.delta !== undefined && stat.delta > 0 ? '+' : ''

          return (
            <div
              key={i}
              data-compile-stats
              style={{ display: 'flex', justifyContent: 'space-between', opacity: 0 }}
            >
              <span style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-sm)',
                lineHeight: 'var(--leading-sm)',
                color: 'var(--text-secondary)',
              }}>
                {stat.label}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-mono)',
                lineHeight: 'var(--leading-mono)',
                color: 'var(--compile-green)',
              }}>
                {stat.text ?? (
                  <>
                    {stat.value}{stat.suffix ?? ''}
                    {stat.delta !== undefined && stat.delta !== 0 && (
                      <span style={{ color: deltaColor }}>
                        {' '}({deltaSign}{stat.delta})
                      </span>
                    )}
                  </>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {/* Orb — compile pulse fires when terminal text fades at 1.8s mark */}
      <DaemonOrb state={data.orbState} size={180} compilePulse={orbPulsing} />

      {/* Daemon prose (2.2s mark) — wrapper is GSAP target; DaemonProse renders text + mic */}
      <div
        data-compile-prose
        style={{ opacity: autoPlay ? 0 : 1, textAlign: 'center', maxWidth: PROSE_MAX_WIDTH, width: '100%' }}
      >
        <DaemonProse
          text={data.daemonProse}
          animate={false}
          showMicIcon={!!audioUrl}
          audioPlaying={audioPlaying}
          onMicClick={onMicClick}
        />
        {data.shadowPrompt && (
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-sm)',
            lineHeight: 'var(--leading-sm)',
            fontWeight: 300,
            color: 'var(--text-muted)',
            fontStyle: 'italic',
            letterSpacing: LETTER_SPACING_TIGHT,
            marginTop: 'var(--space-5)',
          }}>
            {data.shadowPrompt}
          </p>
        )}
      </div>

      {/* Daily Signal (3.8s mark) */}
      <div
        data-compile-signal
        style={{
          width: '100%',
          background: 'rgba(13, 16, 24, 0.72)',
          border: '0.5px solid rgba(255, 255, 255, 0.07)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-5) var(--space-6)',
          opacity: autoPlay ? 0 : 1,
        }}
      >
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-sm)',
          lineHeight: 'var(--leading-sm)',
          fontWeight: 300,
          color: 'var(--text-daemon)',
          fontStyle: 'italic',
          letterSpacing: LETTER_SPACING_TIGHT,
          marginBottom: 'var(--space-2)',
        }}>
          "{data.dailySignalQuote}"
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-mono)',
          lineHeight: 'var(--leading-mono)',
          color: 'var(--text-muted)',
          letterSpacing: '0.05em',
        }}>
          — {data.dailySignalAuthor}
        </p>
      </div>
    </div>
  )
}
