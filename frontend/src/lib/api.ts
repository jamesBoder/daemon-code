import type { CompileData, HomeData, OrbState } from '../types'
import { useAuthStore } from '../stores/authStore'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('token')
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  // Only auto-logout when a token was present — session expiry, not wrong credentials
  if (r.status === 401 && token) {
    useAuthStore.getState().logout()
    window.location.href = '/welcome'
  }
  return r
}

export async function apiFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await apiFetch(path, init)
  if (!r.ok) throw new Error(`API ${r.status}`)
  return r.json() as Promise<T>
}

export async function patchProfile(polly_voice: string | null): Promise<void> {
  const r = await apiFetch('/profile', {
    method: 'PATCH',
    body: JSON.stringify({ polly_voice }),
  })
  if (!r.ok) throw new Error(`PATCH /profile ${r.status}`)
}

export async function getVoiceSampleUrl(voice: string): Promise<string> {
  const data = await apiFetchJson<{ url: string }>(`/audio/sample?voice=${encodeURIComponent(voice)}`)
  return data.url
}

export async function getOnboardingVoiceSampleUrl(voice: string): Promise<string> {
  const data = await apiFetchJson<{ url: string }>(`/audio/sample/onboarding?voice=${encodeURIComponent(voice)}`)
  return data.url
}

const VALID_ORB_STATES: OrbState[] = ['cold', 'warming', 'running', 'deep']

export function homeToCompileData(home: HomeData): CompileData {
  return {
    day: home.day,
    consecutiveDays: home.consecutiveDays ?? 0,
    processingSignals: home.processingSignals,
    analystTime: home.analystTime || '—',
    stats: home.stats.map(s => ({ label: s.label, text: s.value })),
    daemonProse: home.daemonProse || 'The daemon is forming a first impression.',
    shadowPrompt: home.shadowPrompt,
    dailySignalQuote: home.dailySignalQuote,
    dailySignalAuthor: home.dailySignalAuthor,
    orbState: VALID_ORB_STATES.includes(home.orbState as OrbState)
      ? (home.orbState as OrbState)
      : 'cold',
    daemonAudioUrl: home.daemonAudioUrl,
  }
}
