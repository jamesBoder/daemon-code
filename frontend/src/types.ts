// Domain types

export type ProcessState = 'running' | 'sleeping' | 'weakening' | 'new'

export type OrbState = 'cold' | 'warming' | 'running' | 'deep'

export type Archetype =
  | 'abandoned_child'
  | 'unworthy_self'
  | 'caged_rage'
  | 'grief_carrier'
  | 'default'

// A single row in the compile card / compile screen stats block
export interface CompileStat {
  label: string
  value?: number | null
  delta?: number
  suffix?: string
  text?: string
  highlight?: boolean
}

// Data shape for the compile screen and home screen
export interface CompileData {
  day: number
  processingSignals: number
  analystTime: string
  stats: CompileStat[]
  daemonProse: string
  dailySignalQuote: string
  dailySignalAuthor: string
  orbState: OrbState
  daemonAudioUrl?: string
}

// Data shape for a single process entry (component is ProcessEntry, type is ProcessEntryData)
export interface ProcessEntryData {
  id: string
  name: string
  state: ProcessState
  strength: number
  unnamed: boolean
  firstDetected?: string
  lastSeen?: string
  daemonNote?: string
}

// Auth — matches authResponse JSON from /auth/register and /auth/login
export interface AuthResponse {
  token: string
  onboarding_complete: boolean
  timezone: string
}

// Shadow profile — matches db.ShadowProfile with emit_json_tags (snake_case keys)
export interface ShadowProfile {
  id: string
  user_id: string
  primary_archetype: Archetype
  signal_confidence: number
  kernel_access: number
  stage: OrbState
  posture: number
  environment: string
  texture: string
  fragments_decoded: number
  compile_count: number
  analyst_notes: string | null
}

// Home — homeResponse DTO has explicit json tags (already correct)
export interface HomeData {
  day: number
  processingSignals: number
  analystTime: string
  stats: { label: string; value: string }[]
  daemonProse: string
  dailySignalQuote: string
  dailySignalAuthor: string
  orbState: OrbState
  daemonAudioUrl?: string
}

// Session fragments — Fragment is from DynamoDB with explicit json tags
export interface Fragment {
  id: string
  type: 'reaction_test' | 'weighted_scale' | 'prediction_duel'
  payload: string
  daemon_note: string
  order: number
}

export interface SessionTodayResponse {
  fragments: Fragment[]
  ready: boolean
}

// Process — matches db.PatternLibrary with emit_json_tags (snake_case keys)
export interface Process {
  id: string
  user_id: string
  name: string | null
  state: ProcessState
  strength: number
  unnamed: boolean
  first_detected: string
  last_seen: string | null
  daemon_note: string | null
}

// Used in SessionContainer to accumulate posted responses
export interface SubmittedResponse {
  fragment_id: string
  fragment_type: string
  response_data: unknown
}

// Process change recorded by the Analyst after a nightly run
export interface ProcessDiff {
  id:        string
  name:      string
  change:    'named' | 'strength_up' | 'strength_down' | 'new'
  from_name?: string  // previous name for 'named' changes
  delta?:    number   // strength delta for 'strength_up' / 'strength_down'
}
