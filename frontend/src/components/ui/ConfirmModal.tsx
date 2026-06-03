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
            onClick={onConfirm}
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
