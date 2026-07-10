import type { ReactElement } from 'react'
import { ReactionTest } from './ReactionTest'
import { WeightedScale } from './WeightedScale'
import { PredictionDuel } from './PredictionDuel'
import { SpeedRound } from './SpeedRound'
import type { SpeedRoundPrompt } from './SpeedRound'
import { TrapGame } from './TrapGame'
import type { TrapChoice } from './TrapGame'
import { Stroop } from './Stroop'
import type { StroopItem } from './Stroop'
import { Hold } from './Hold'
import { Split } from './Split'
import type { Fragment } from '../../types'

export interface FragmentRendererArgs {
  fragment: Fragment
  /** Parsed fragment payload — shape is owned by the matching backend builder in internal/services/deck. */
  raw: Record<string, unknown>
  /** Called with the response_data posted to /session/response. */
  onComplete: (responseData: unknown) => void
}

// One entry per playable fragment type, rendered as a JSX component keyed by
// fragment id. Adding a minigame to the daily session: build the component,
// add its entry here, add a copy.fragmentContext line for the first-encounter
// hint, and add its backend builder in internal/services/deck.
// SessionContainer drops fragment types with no entry, so older clients
// survive decks that contain games they don't know yet.
export const fragmentRegistry: Record<string, (args: FragmentRendererArgs) => ReactElement> = {
  reaction_test: ({ raw, onComplete }) => (
    <ReactionTest
      words={raw.words as string[]}
      durationMs={raw.duration_ms as number}
      onComplete={onComplete}
    />
  ),
  weighted_scale: ({ raw, onComplete }) => (
    <WeightedScale
      pairs={[{ left: raw.left as string, right: raw.right as string }]}
      onComplete={onComplete}
    />
  ),
  prediction_duel: ({ raw, onComplete }) => (
    <PredictionDuel
      pattern={raw.pattern as string}
      prediction={raw.prediction as string}
      record={raw.daemon_record as number | undefined}
      onComplete={onComplete}
    />
  ),
  speed_round: ({ raw, onComplete }) => (
    <SpeedRound
      prompts={raw.prompts as SpeedRoundPrompt[]}
      onComplete={onComplete}
    />
  ),
  stroop: ({ raw, onComplete }) => (
    <Stroop
      items={raw.items as StroopItem[]}
      onComplete={onComplete}
    />
  ),
  hold: ({ raw, onComplete }) => (
    // The void is personalized: buildHold stamps { seed, charge, intimacy } so it
    // is never the same room twice and never identical between users.
    <Hold params={raw} onComplete={onComplete} />
  ),
  split: ({ raw, onComplete }) => (
    // buildSplit stamps { seed, framing }: the rotated resource framing plus a
    // per-night seed that jitters the watching counterpart's presence.
    <Split params={raw} onComplete={onComplete} />
  ),
  trap: ({ raw, onComplete }) => (
    <TrapGame
      trapId={raw.trap_id as string}
      kind={raw.kind as 'odds' | 'sunk' | 'overconfidence'}
      scenario={raw.scenario as string}
      stake={raw.stake as number | undefined}
      sunk={raw.sunk as number | undefined}
      winProb={raw.win_prob as number | undefined}
      riskSide={raw.risk_side as 'a' | 'b' | undefined}
      choiceA={raw.choice_a as TrapChoice | undefined}
      choiceB={raw.choice_b as TrapChoice | undefined}
      max={raw.max as number | undefined}
      onComplete={onComplete}
    />
  ),
}
