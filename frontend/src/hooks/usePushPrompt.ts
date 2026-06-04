import { useEffect, useState } from 'react'
import { PUSH_PROMPT_DAY_THRESHOLD, PUSH_PROMPT_DELAY_MS, PUSH_PROMPT_KEY } from '../lib/constants'
import { apiFetch } from '../lib/api'

export function usePushPrompt(day: number) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (day < PUSH_PROMPT_DAY_THRESHOLD)          return
    if (localStorage.getItem(PUSH_PROMPT_KEY))    return
    if (!('Notification' in window))              return  // iOS Safari: API absent
    if (Notification.permission !== 'default')    return  // already granted or denied

    const t = setTimeout(() => setShow(true), PUSH_PROMPT_DELAY_MS)
    return () => clearTimeout(t)
  }, [day])

  function dismiss() {
    localStorage.setItem(PUSH_PROMPT_KEY, 'true')
    setShow(false)
  }

  async function enable() {
    localStorage.setItem(PUSH_PROMPT_KEY, 'true')
    setShow(false)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
      })
      await apiFetch('/push/subscribe', { method: 'POST', body: JSON.stringify(sub) })
    } catch {
      // SW unavailable or subscribe rejected — prompt is already dismissed, nothing to do
    }
  }

  return { show, dismiss, enable }
}
