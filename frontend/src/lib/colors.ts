import type { Archetype } from '../types'

export interface ArchetypeAccent {
  accent: string
  glow: string
}

export const archetypeAccents: Record<Archetype, ArchetypeAccent> = {
  abandoned_child: { accent: '#818cf8', glow: 'rgba(129,140,248,0.15)' },
  unworthy_self:   { accent: '#d97706', glow: 'rgba(217,119,6,0.15)'   },
  caged_rage:      { accent: '#dc2626', glow: 'rgba(220,38,38,0.15)'   },
  grief_carrier:   { accent: '#0891b2', glow: 'rgba(8,145,178,0.15)'   },
  default:         { accent: '#6366f1', glow: 'rgba(99,102,241,0.15)'  },
}

export function applyArchetypeAccent(archetype: Archetype): void {
  const { accent, glow } = archetypeAccents[archetype]
  document.documentElement.style.setProperty('--accent', accent)
  document.documentElement.style.setProperty('--accent-glow', glow)
}
