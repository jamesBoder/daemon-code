import { useEffect, useState, type CSSProperties } from 'react'
import { DECODE_GLYPHS, DECODE_CHAR_MS, DECODE_SCRAMBLE_MS } from '../../lib/constants'

interface DecodeTextProps {
  text: string
  style?: CSSProperties
}

function randomGlyph(): string {
  return DECODE_GLYPHS[Math.floor(Math.random() * DECODE_GLYPHS.length)]
}

// DecodeText resolves a line character-by-character (left to right) out of
// cycling glyphs — the daemon "composing" what it says. This is a character
// reveal, not spatial motion, so it runs under reduced-motion too. The final
// text is exposed to assistive tech via aria-label while the scramble is hidden.
function scrambleOf(text: string): string {
  return Array.from(text).map(c => (c === ' ' ? ' ' : randomGlyph())).join('')
}

export function DecodeText({ text, style }: DecodeTextProps) {
  const [revealed, setRevealed] = useState(0)
  // Seed with a scrambled frame so the final text never flashes before resolving.
  const [scramble, setScramble] = useState(() => scrambleOf(text))

  useEffect(() => {
    let r = 0
    // Defined before `reveal` so the reveal callback can stop it on completion.
    const scram = setInterval(() => setScramble(scrambleOf(text)), DECODE_SCRAMBLE_MS)

    const reveal = setInterval(() => {
      r += 1
      setRevealed(r)
      if (r >= text.length) {
        // Fully resolved — stop both timers so we don't re-render the tail forever.
        clearInterval(reveal)
        clearInterval(scram)
      }
    }, DECODE_CHAR_MS)

    return () => {
      clearInterval(reveal)
      clearInterval(scram)
    }
  }, [text])

  const shown = text.slice(0, revealed) + scramble.slice(revealed)

  return (
    <span aria-label={text} style={style}>
      <span aria-hidden="true">{shown}</span>
    </span>
  )
}
