import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { DaemonButton } from './DaemonButton'
import { MODAL_Z_INDEX, MODAL_MAX_WIDTH } from '../../lib/constants'

interface ConfirmModalProps {
  message:      string
  confirmLabel: string
  cancelLabel:  string
  dangerous?:   boolean
  onConfirm:    () => void
  onCancel:     () => void
}

export function ConfirmModal({ message, confirmLabel, cancelLabel, dangerous, onConfirm, onCancel }: ConfirmModalProps) {
  const confirmed = useRef(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus first button on open; restore focus to prior element on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    return () => { prev?.focus() }
  }, [])

  // Trap Tab/Shift+Tab within the modal buttons.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
      if (buttons.length === 0) return
      const first = buttons[0]
      const last  = buttons[buttons.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleConfirm() {
    if (confirmed.current) return
    confirmed.current = true
    onConfirm()
  }

  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--surface-overlay)',
        zIndex: MODAL_Z_INDEX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="glass-card"
        onClick={e => e.stopPropagation()}
        style={{
          width: `min(88vw, ${MODAL_MAX_WIDTH}px)`,
          padding: 'var(--space-8)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          lineHeight: 'var(--leading-xl)',
          color: 'var(--text-primary)',
          textAlign: 'center',
          margin: 0,
        }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <DaemonButton variant="secondary" onClick={onCancel} style={{ flex: 1 }}>
            {cancelLabel}
          </DaemonButton>
          <DaemonButton
            onClick={handleConfirm}
            style={{
              flex: 1,
              ...(dangerous ? { background: 'var(--warning)', borderColor: 'var(--warning)' } : {}),
            }}
          >
            {confirmLabel}
          </DaemonButton>
        </div>
      </div>
    </div>,
    document.body
  )
}
