import type { CompileData, HomeData, OrbState, SessionCompleteResult } from '../types'
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

// --- Pulse (The Map) ---

export interface PulseScenario {
  scenario_id: string
  type: string
  text: string
  daemon_observation: string
  daemon_prediction: string
  observation_audio_url?: string  // presigned; present only when the observation was voiced (8b)
}

export interface PulseNode {
  node_id: string
  text: string
}

export interface PulseTodayResponse {
  completed: boolean
  scenario?: PulseScenario
  nodes?: PulseNode[]
}

export interface PulseConnection {
  a: string
  b: string
}

export interface PostPulseResponseBody {
  scenario_id: string
  connections: PulseConnection[]
  isolated_nodes: string[]
  first_wire_delay_ms: number | null
  duration_ms: number
}

export async function getPulseToday(): Promise<PulseTodayResponse> {
  return apiFetchJson<PulseTodayResponse>('/pulse/today')
}

export async function postPulseResponse(body: PostPulseResponseBody): Promise<void> {
  const r = await apiFetch('/pulse/response', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`POST /pulse/response ${r.status}`)
}

// Finalize a session: triggers the cheap deterministic scorer (no AI) and returns
// live process movement + an immediate daemon line.
export async function postSessionComplete(): Promise<SessionCompleteResult> {
  return apiFetchJson<SessionCompleteResult>('/session/complete', { method: 'POST' })
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
    daemonProse: home.daemonProse || 'Signal collected. The daemon compiles overnight.',
    shadowPrompt: home.shadowPrompt,
    dailySignalQuote: home.dailySignalQuote,
    dailySignalAuthor: home.dailySignalAuthor,
    orbState: VALID_ORB_STATES.includes(home.orbState as OrbState)
      ? (home.orbState as OrbState)
      : 'cold',
    daemonAudioUrl: home.daemonAudioUrl,
    compileLogLines: home.compileLogLines,
    kernelAccess:       home.kernelAccess       ?? 0,
    daemonAccuracy:     home.daemonAccuracy      ?? 0,
    decodedLines:       home.decodedLines        ?? 0,
    kernelAccessDelta:  home.kernelAccessDelta   ?? 0,
    daemonAccuracyDelta: home.daemonAccuracyDelta ?? 0,
    decodedLinesDelta:  home.decodedLinesDelta   ?? 0,
  }
}
