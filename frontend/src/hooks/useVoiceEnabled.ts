import { useEffect, useState } from 'react'
import { DAEMON_VOICE_KEY, DAEMON_VOICE_EVENT } from '../lib/constants'

/** Whether the daemon voice is enabled (8e). Default on — opt-out. */
export function isVoiceEnabled(): boolean {
  return localStorage.getItem(DAEMON_VOICE_KEY) !== 'false'
}

/** Reactive read of the daemon-voice preference. Updates when the Settings
 *  toggle flips (same-tab custom event) or another tab changes it. Used to gate
 *  every tap-to-listen mic affordance. */
export function useVoiceEnabled(): boolean {
  const [enabled, setEnabled] = useState(isVoiceEnabled)
  useEffect(() => {
    const update = () => setEnabled(isVoiceEnabled())
    window.addEventListener(DAEMON_VOICE_EVENT, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(DAEMON_VOICE_EVENT, update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return enabled
}
