import { HAIRLINE, LETTER_SPACING_WIDE, SCREEN_HEADER_HEIGHT } from '../../lib/constants'

interface ScreenHeaderProps {
  title: string
}

export function ScreenHeader({ title }: ScreenHeaderProps) {
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
      zIndex: 50,
    }}>
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
