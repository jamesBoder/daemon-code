import { AnimatePresence, motion } from 'framer-motion'
import { HAIRLINE, LETTER_SPACING_TIGHT, LETTER_SPACING_WIDE, MODAL_Z_INDEX } from '../../lib/constants'
import { copy } from '../../lib/copy'
import type { ScoreSheetKey } from '../../lib/copy'

interface ScoreSheetProps {
  active:  ScoreSheetKey | null
  onClose: () => void
}

const SHEET = {
  spring:   { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const },
  fadeMs:   0.18,
  handleW:  32,
  handleH:  3,
  maxH:     '72vh',
} as const

export function ScoreSheet({ active, onClose }: ScoreSheetProps) {
  return (
    <AnimatePresence>
      {active && (
        <>
          {/* Tap-outside backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: SHEET.fadeMs }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'var(--background)',
              zIndex: MODAL_Z_INDEX - 1,
            }}
          />

          {/* Sheet panel */}
          <motion.div
            key={active}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SHEET.spring}
            className="glass-card"
            style={{
              position:     'fixed',
              bottom:       0, left: 0, right: 0,
              zIndex:       MODAL_Z_INDEX,
              borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
              padding:      'var(--space-5) var(--space-6)',
              paddingBottom:'calc(var(--space-6) + env(safe-area-inset-bottom))',
              maxHeight:    SHEET.maxH,
              overflowY:    'auto',
            }}
          >
            {/* Drag handle indicator */}
            <div style={{
              width:        SHEET.handleW,
              height:       SHEET.handleH,
              background:   'var(--border)',
              borderRadius: 999,
              margin:       '0 auto var(--space-5)',
            }} />

            <SheetBody scoreKey={active} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function SheetBody({ scoreKey }: { scoreKey: ScoreSheetKey }) {
  const { title, paragraphs } = copy.scoreSheets[scoreKey]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <p style={{
        fontFamily:    'var(--font-mono)',
        fontSize:      'var(--text-xs)',
        color:         'var(--text-muted)',
        letterSpacing: LETTER_SPACING_WIDE,
        textTransform: 'uppercase',
        margin:        0,
      }}>
        {title}
      </p>

      <div style={{ height: HAIRLINE, background: 'var(--border)' }} />

      {paragraphs.map((para, i) => (
        <p key={i} style={{
          fontFamily:    'var(--font-display)',
          fontSize:      'var(--text-sm)',
          lineHeight:    'var(--leading-sm)',
          fontWeight:    300,
          color:         'var(--text-secondary)',
          fontStyle:     'italic',
          letterSpacing: LETTER_SPACING_TIGHT,
          margin:        0,
        }}>
          {para}
        </p>
      ))}
    </div>
  )
}
