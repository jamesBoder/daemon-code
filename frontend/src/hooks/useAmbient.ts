import { useEffect } from 'react'
import { useSoundEnabled } from './useSoundEnabled'
import { startAmbient, setAmbientConfidence } from '../lib/sound'

/** Drives the signal-reactive ambient bed (§7). Pass the daemon's signal
 *  confidence as 0–1 (e.g. kernelAccess / 100). Starts the bed when sound is
 *  enabled and glides its low-pass cutoff as confidence changes. Intentionally
 *  does NOT stop the bed on unmount — the ambience persists across screens; it's
 *  torn down only when the user flips the Settings toggle off (which calls
 *  stopAmbient directly). startAmbient is idempotent, so remounting is a no-op. */
export function useAmbient(confidence: number) {
  const enabled = useSoundEnabled()
  useEffect(() => {
    if (!enabled) return
    startAmbient(confidence)
    setAmbientConfidence(confidence)
  }, [enabled, confidence])
}
