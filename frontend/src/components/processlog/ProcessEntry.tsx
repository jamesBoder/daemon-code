import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ProcessStatus } from './ProcessStatus'
import { springs } from '../../lib/springs'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { copy } from '../../lib/copy'
import { REDUCED_MOTION_DURATION } from '../../lib/constants'
import type { ProcessState } from '../../types'

interface ProcessEntryProps {
  name: string
  state: ProcessState
  strength: number
  unnamed?: boolean
  firstDetected?: string
  lastSeen?: string
  daemonNote?: string
  unnamedMessage?: string
}

export function ProcessEntry({
  name,
  state,
  strength,
  unnamed = false,
  firstDetected,
  lastSeen,
  daemonNote,
  unnamedMessage = copy.processLog.unnamedExpanded,
}: ProcessEntryProps) {
  const [expanded, setExpanded] = useState(false)
  const reduced = useReducedMotion()

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background: 'rgba(13, 16, 24, 0.72)',
        border: '0.5px solid rgba(255, 255, 255, 0.07)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Collapsed row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 'var(--space-4) var(--space-5)',
        gap: 'var(--space-4)',
      }}>
        {/* Left: name + bar (or "still forming") */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0, flex: 1 }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-mono)',
            lineHeight: 'var(--leading-mono)',
            color: unnamed ? 'var(--text-muted)' : 'var(--text-secondary)',
            letterSpacing: '0.02em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {name}
          </span>

          {unnamed ? (
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-xs)',
              lineHeight: 'var(--leading-xs)',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}>
              {copy.processLog.stillForming}
            </span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <div style={{
                flex: 1,
                height: 2,
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 'var(--radius-full)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${strength}%`,
                  background: 'var(--accent)',
                  borderRadius: 'var(--radius-full)',
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-mono)',
                lineHeight: 'var(--leading-mono)',
                color: 'var(--text-muted)',
                letterSpacing: '0.02em',
                flexShrink: 0,
              }}>
                {strength}%
              </span>
            </div>
          )}
        </div>

        <ProcessStatus state={state} />
      </div>

      {/* Expanded detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduced
              ? { duration: REDUCED_MOTION_DURATION }
              : { ...springs.slow, opacity: { duration: 0.2 } }
            }
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: 'var(--space-3) var(--space-5) var(--space-4)',
              borderTop: '0.5px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}>
              {unnamed ? (
                <p style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 'var(--leading-sm)',
                  fontStyle: 'italic',
                  color: 'var(--text-muted)',
                }}>
                  {unnamedMessage}
                </p>
              ) : (
                <>
                  {firstDetected && <DetailRow label="first detected" value={firstDetected} />}
                  <DetailRow label="strength" value={`${strength}%`} />
                  {lastSeen && (state === 'sleeping' || state === 'weakening') && (
                    <DetailRow label="last seen" value={lastSeen} />
                  )}
                  {daemonNote && (
                    <p style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--text-sm)',
                      lineHeight: 'var(--leading-sm)',
                      fontStyle: 'italic',
                      color: 'var(--text-daemon)',
                      marginTop: 'var(--space-1)',
                    }}>
                      {daemonNote}
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        lineHeight: 'var(--leading-xs)',
        color: 'var(--text-muted)',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-mono)',
        lineHeight: 'var(--leading-mono)',
        color: 'var(--text-secondary)',
      }}>
        {value}
      </span>
    </div>
  )
}
