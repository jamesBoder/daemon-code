import { useEffect, useState } from 'react'
import { SOUND_EVENT } from '../lib/constants'
import { isSoundEnabled } from '../lib/sound'

/** Reactive read of the Web Audio atmosphere preference (§7). Default off —
 *  opt-in, so the daemon never makes a sound the user didn't ask for. Updates
 *  when the Settings toggle flips (same-tab custom event) or another tab changes
 *  it. Mirrors useVoiceEnabled. */
export function useSoundEnabled(): boolean {
  const [enabled, setEnabled] = useState(isSoundEnabled)
  useEffect(() => {
    const update = () => setEnabled(isSoundEnabled())
    window.addEventListener(SOUND_EVENT, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(SOUND_EVENT, update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return enabled
}
