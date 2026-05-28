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
