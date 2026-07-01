// Domain types

export type ProcessState = 'running' | 'sleeping' | 'weakening' | 'new'

export type OrbState = 'cold' | 'warming' | 'running' | 'deep'

export type Archetype =
  | 'abandoned_child'
  | 'unworthy_self'
  | 'caged_rage'
  | 'grief_carrier'
  | 'default'

// The seven personality dimensions the Portrait renders from. The stored model
// also carries game-theory metrics (discount_factor, grim_trigger, k_level) that
// the Portrait does not map — keep this list as the render contract.
export type PortraitDimension =
  | 'openness'
  | 'conscientiousness'
  | 'agreeableness'
  | 'neuroticism'
  | 'locus_of_control'
  | 'approach_avoidance'
  | 'temporal_focus'

// One dimension as the Self read exposes it — score and its confidence, both 0..1
// (k_level can exceed 1, but it is not a PortraitDimension). Raw numbers are never
// shown to the user; they drive the generative form.
export interface DimensionValue {
  score: number
  confidence: number
}

// GET /self — the daemon's current read, used to render the Portrait. Dimension
// maps are keyed by the stored dimension name; the Portrait selects the seven it
// maps and treats any missing one as zero-confidence.
export interface SelfRead {
  dimensions: Partial<Record<string, DimensionValue>>
  signalConfidence: number
  archetype: Archetype
  stage: OrbState
  compileCount: number
}

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
  consecutiveDays: number
  processingSignals: number
  analystTime: string
  stats: CompileStat[]
  daemonProse: string
  shadowPrompt?: string
  dailySignalQuote: string
  dailySignalAuthor: string
  orbState: OrbState
  daemonAudioUrl?: string
  compileLogLines?: string[]  // Analyst-generated terminal lines; absent before first compile
  // Scoring system
  kernelAccess: number
  daemonAccuracy: number
  decodedLines: number
  kernelAccessDelta: number
  daemonAccuracyDelta: number
  decodedLinesDelta: number
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
  // What happened to this process in the latest compile, from /session/recent-diff
  diffChange?: ProcessDiff['change']
  diffDelta?: number
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
  polly_voice:   string | null
}

// Home — homeResponse DTO has explicit json tags (already correct)
export interface HomeData {
  day: number
  consecutiveDays: number
  processingSignals: number
  analystTime: string
  stats: { label: string; value: string }[]
  daemonProse: string
  shadowPrompt?: string
  dailySignalQuote: string
  dailySignalAuthor: string
  orbState: OrbState
  daemonAudioUrl?: string
  compileLogLines?: string[]
  // Scoring system
  kernelAccess: number
  daemonAccuracy: number
  decodedLines: number
  kernelAccessDelta: number
  daemonAccuracyDelta: number
  decodedLinesDelta: number
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

// A single entry in the Chronicle — one nightly prose from the Narrator
export interface ChronicleEntry {
  date: string
  day: number
  orbState?: OrbState
  prose: string
  shadowPrompt?: string
  signalQuote?: string
  signalAuthor?: string
  audioUrl?: string
}

// Process change recorded by the Analyst after a nightly run
export interface ProcessDiff {
  id:        string
  name:      string
  change:    'named' | 'strength_up' | 'strength_down' | 'new'
  from_name?: string  // previous name for 'named' changes
  delta?:    number   // strength delta for 'strength_up' / 'strength_down'
}

// GET /session/recent-diff — the diff plus the naming-ceremony voice clip (8c),
// present only on nights a process earned a name.
export interface RecentDiffResponse {
  diff:            ProcessDiff[]
  namingAudioUrl?: string
}

// POST /session/complete — the live, deterministic process movement computed at
// session end (no Anthropic call) plus an immediate daemon line. Diff reuses the
// ProcessDiff shape so SessionComplete renders it like the nightly diff.
export interface SessionCompleteResult {
  diff:       ProcessDiff[]
  daemonLine: string
}
