import { HAIRLINE, HEADER_Z_INDEX, LETTER_SPACING_WIDE, MIN_TOUCH_TARGET, SCREEN_HEADER_HEIGHT } from '../../lib/constants'

interface ScreenHeaderProps {
  title:   string
  onBack?: () => void
}

export function ScreenHeader({ title, onBack }: ScreenHeaderProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      height: `calc(${SCREEN_HEADER_HEIGHT}px + env(safe-area-inset-top))`,
      paddingTop: 'env(safe-area-inset-top)',
      background: 'rgba(13, 16, 24, 0.92)',
      borderBottom: `${HAIRLINE} solid rgba(255, 255, 255, 0.07)`,
      backdropFilter: 'blur(16px) saturate(140%)',
      WebkitBackdropFilter: 'blur(16px) saturate(140%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: HEADER_Z_INDEX,
    }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{
            position:   'absolute',
            left:       0,
            top:        'env(safe-area-inset-top)',
            height:     SCREEN_HEADER_HEIGHT,
            minWidth:   MIN_TOUCH_TARGET,
            paddingLeft:'var(--space-5)',
            paddingRight:'var(--space-3)',
            background: 'none',
            border:     'none',
            cursor:     'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize:   'var(--text-xs)',
            color:      'var(--text-muted)',
            letterSpacing: LETTER_SPACING_WIDE,
            display:    'flex',
            alignItems: 'center',
          }}
        >
          ←
        </button>
      )}
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)',
        letterSpacing: LETTER_SPACING_WIDE,
      }}>
        {title}
      </span>
    </div>
  )
}
