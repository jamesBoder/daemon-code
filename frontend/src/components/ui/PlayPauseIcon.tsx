// SVG play/pause glyphs — Unicode ⏵/⏸ lack font coverage on some platforms
// (Windows renders ⏵ as a tofu box), so these are drawn inline instead.
const ICON = {
  viewBox: 14,
  play:    'M3.5 2.2 11.8 7 3.5 11.8Z',
  pause:   { barWidth: 2.6, barHeight: 9.6, leftX: 3.2, rightX: 8.2, topY: 2.2 },
} as const

interface PlayPauseIconProps {
  playing: boolean
  size?: number
}

export function PlayPauseIcon({ playing, size = ICON.viewBox }: PlayPauseIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${ICON.viewBox} ${ICON.viewBox}`}
      fill="currentColor"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {playing ? (
        <>
          <rect x={ICON.pause.leftX}  y={ICON.pause.topY} width={ICON.pause.barWidth} height={ICON.pause.barHeight} />
          <rect x={ICON.pause.rightX} y={ICON.pause.topY} width={ICON.pause.barWidth} height={ICON.pause.barHeight} />
        </>
      ) : (
        <path d={ICON.play} />
      )}
    </svg>
  )
}
