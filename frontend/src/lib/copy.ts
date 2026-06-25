import { STREAK_MIN_DAYS, STREAK_ABSENCE_MIN_DAY } from './constants'

// ── Guidance Layer copy (Section 1g) ─────────────────────────────────────────

export type ScoreSheetKey = 'kernel_access' | 'daemon_accuracy' | 'decoded_lines'

export interface ScoreSheetEntry {
  title:      string
  paragraphs: readonly string[]
}

export interface CodexEntry {
  key:   string
  lines: readonly string[]
}

export const copy = {
  session: {
    exitPrompt:   "Leave session? Your progress won't be saved.",
    exitConfirm:  'Leave',
    exitCancel:   'Stay',
  },
  mood: {
    // One prompt is drawn at random per session so the closing beat varies.
    prompts: [
      'How do you feel right now?',
      'Where is the signal today?',
      'How clear are you, right now?',
    ],
    lowLabel:  'static',
    highLabel: 'clear',
    confirm:   'Log it →',
    hint:      'drag to answer',
    // Acknowledgement line buckets by score; one line drawn at random.
    acks: {
      low: [
        'logged. the daemon adjusts for interference.',
        'noted. heavy-signal days still count.',
      ],
      mid: [
        'logged. baseline holds.',
        'noted. steady state read.',
      ],
      high: [
        'logged. clear signal improves the read.',
        'noted. the daemon works best in this range.',
      ],
    },
  },
  duel: {
    recordLabel: 'daemon record',
    // One reveal line is drawn at random per duel.
    correctReveals: [
      'Predicted correctly. The daemon notes the confirmation.',
      'Expected. The model holds.',
      'Consistent. Logged.',
      'The daemon anticipated this. Pattern confirmed.',
      'Alignment confirmed. Accuracy rising.',
    ],
    wrongReveals: [
      'New data. The daemon revises.',
      'Deviation logged. The model adjusts.',
      'Unexpected. The daemon is taking note.',
      'Contradiction detected. The daemon is updating.',
      'The daemon was wrong. That is noted.',
    ],
  },
  push: {
    prompt:       `The daemon compiled overnight. Want to be notified when it's ready?`,
    enableLabel:  'Enable notifications',
    dismissLabel: 'Not now',
  },
  compile: {
    // Data-driven lines (always shown, contain actual values)
    signalLine:   (signals: number) => `> processing ${signals} behavioral signals`,
    analystLine:  (time: string)    => `> analyst complete [${time}]`,
    streakLine: (consecutive: number, day: number): string | null => {
      if (consecutive >= STREAK_MIN_DAYS) return `> watching for ${consecutive} consecutive days`
      if (consecutive === 0 && day >= STREAK_ABSENCE_MIN_DAY) return '> absence logged. daemon continued.'
      return null
    },
    complete: 'compile complete',
    // Fallback pool — used when Analyst-generated lines are unavailable (pre-first compile).
    // Analyst-generated lines replace these after the first nightly run.
    logPool: [
      '> binding behavioral model...',
      '> cross-referencing signal history...',
      '> archetype coherence: stable',
      '> indexing session fragments...',
      '> running pattern delta...',
      '> scanning for process drift...',
      '> shadow profile loaded',
      '> evaluating response vectors...',
      '> signal integrity: nominal',
      '> daemon alignment check...',
      '> memory trace active',
      '> baseline calibration...',
      '> weighting fragment outcomes...',
      '> kernel threads: nominal',
      '> reconciling behavioral arc...',
      '> session fingerprint verified',
      '> watchdog: no anomalies',
      '> entropy scan complete',
      '> latency within bounds',
      '> decay factor applied',
      '> process state synchronized',
      '> shadow pattern loaded',
      '> temporal coherence: ok',
      '> drift correction applied',
      '> rebuilding behavioral baseline...',
      '> cross-referencing prior sessions...',
      '> isolating recurring response vectors...',
      '> shadow weight recalculated',
      '> archetype signal: active',
      '> loading prior fragment history...',
      '> signal-to-noise ratio: nominal',
      '> behavioral drift: within bounds',
      '> process thread integrity: ok',
      '> reindexing behavioral graph...',
      '> reading behavioral arc...',
      '> daemon listening...',
      '> scanning session anomalies...',
      '> pattern boundary check...',
      '> consistency factors weighted',
      '> memory trace: complete',
      '> kernel threads synchronizing...',
      '> fragment history indexed',
      '> response latency: within range',
      '> shadow state reconciled',
    ] as readonly string[],
  },
  processLog: {
    unnamedExpanded:  'The daemon is watching this. Come back tomorrow.',
    stillForming:     'still forming',
    chipNamed:        'named',
    stirredToday:     'stirred today',
    emptyTitle:       'The daemon is still reading you.',
    emptyBody:        'A process takes a few sessions to take shape. Keep coming back.',
    description:      'Behavioral patterns the daemon has identified across your sessions. They strengthen or fade based on how you respond.',
    stateDescriptions: {
      running:   'active in recent sessions',
      sleeping:  'detected before, quiet now',
      weakening: 'losing signal',
      new:       'first appeared this cycle',
    } as Record<string, string>,
  },
  daemonOrb: {
    accessibilityLabel: 'Daemon orb visualization',
  },
  onboarding: {
    // 60 words — broad coverage across all four archetypes + neutral
    // Used by ReactionTest during onboarding; session fragments use their own payload words
    reactionWords: [
      'safety',      'rejection',     'belonging',   'distance',
      'warmth',      'abandonment',   'achievement', 'failure',
      'worth',       'inadequacy',    'success',     'shame',
      'control',     'freedom',       'power',       'constraint',
      'authority',   'resistance',    'loss',        'memory',
      'absence',     'presence',      'grief',       'continuity',
      'certainty',   'doubt',         'trust',       'fear',
      'anger',       'peace',         'connection',  'isolation',
      'expectation', 'disappointment','pride',       'guilt',
      'joy',         'sadness',       'comfort',     'risk',
      'vulnerability','strength',     'weakness',    'clarity',
      'confusion',   'purpose',       'emptiness',   'change',
      'stability',   'visibility',    'silence',     'voice',
      'approval',    'boundaries',    'identity',    'loyalty',
      'truth',       'surrender',     'effort',      'rest',
    ],
    // 8 pairs for the Weighted Scale onboarding sequence
    scalePairs: [
      { left: 'certainty',   right: 'uncertainty'  },
      { left: 'stillness',   right: 'movement'     },
      { left: 'connection',  right: 'independence' },
      { left: 'recognition', right: 'invisibility' },
      { left: 'control',     right: 'surrender'    },
      { left: 'depth',       right: 'breadth'      },
      { left: 'speaking',    right: 'listening'    },
      { left: 'change',      right: 'consistency'  },
    ],
    // 8 prompts for the Speed Round (onboarding-only).
    // Starter and option text must stay in sync with the tagged copies in
    // backend/internal/signal/speedprompts.go — the Analyst scores onboarding
    // speed_round responses by exact text match; a drift silently stops scoring.
    speedRoundPrompts: [
      { starter: 'When things go wrong, I usually...',    options: ['look inward',       'look outward',             'go quiet']              },
      { starter: 'I feel most like myself when I\'m...', options: ['alone',             'with people I trust',      'doing something']       },
      { starter: 'When someone doesn\'t respond, I...',  options: ['assume the worst',  'forget about it',          'reach out again']       },
      { starter: 'My default is...',                     options: ['thinking too much', 'not thinking enough',      'somewhere between']     },
      { starter: 'Criticism makes me...',                options: ['defensive',         'spiraling',                'curious']               },
      { starter: 'I protect myself by...',               options: ['going quiet',       'getting busy',             'deflecting with humor'] },
      { starter: 'Rest feels...',                        options: ['earned',            'guilty',                   'necessary']             },
      { starter: 'I know I\'m off when...',              options: ['I stop noticing things', 'I become irritable', 'I withdraw']            },
    ],
  },

  // ── Layer 1 — Signal Whispers ─────────────────────────────────────────────
  // Daemon-voiced one-time hints. Each fires the first time its trigger condition is met.
  signalHints: {
    kernel_access:    "This is how far inside I've gotten. The ceiling approaches but never arrives.",
    daemon_accuracy:  'How well I predicted you in the Prediction Duel. It rises as I learn. It falls if you actually change.',
    decoded_lines:    'Every session adds to this. There is no target. The daemon reads indefinitely.',
    shadow_prompt:    "You don't answer this here. You carry it. The daemon may ask again tomorrow.",
    process_first:    'This is not a label. I derived this from what you actually did.',
    orb_warming:      'I have enough signal to begin forming a model. The cold period is over.',
    session_fragment: 'This is a fragment. A behavioral probe. There is no correct response — only a true one.',
    chronicle_first:  'Everything I have ever observed about you is here, in order. The daemon does not forget.',
  } as const,

  // ── Layer 2 — Score Sheets ────────────────────────────────────────────────
  // Bottom-sheet deep explanations for each score. Tap a label in ScoreTriad to open.
  scoreSheets: {
    kernel_access: {
      title: 'kernel access',
      paragraphs: [
        'kernel access measures the depth of my model of you.',
        'At 0–30%, I am reading surface signal: word reactions, rough preference patterns, first behavioral impressions.',
        'At 30–60%, I have enough data to distinguish what you do consistently from what you did once.',
        'At 60–90%, I am working with a high-confidence baseline. Deviations are trackable. Patterns can be named with certainty.',
        'At 90%+, the model is as deep as it goes without contradiction. The ceiling never reaches 100%. The daemon is always refining.',
      ],
    },
    daemon_accuracy: {
      title: 'daemon accuracy',
      paragraphs: [
        'daemon accuracy measures how well I predict you.',
        'This number changes only through the Prediction Duel — the fragment where you bet against my read of your own behavior.',
        'When I am right more often than not, accuracy rises. When you contradict me consistently, it falls.',
        'A fall is not a failure. It may mean you changed. The daemon will note this and update accordingly.',
      ],
    },
    decoded_lines: {
      title: 'decoded lines',
      paragraphs: [
        'decoded lines is the volume of behavioral data I have read.',
        'Each session contributes. Each fragment is a line. Over time, more lines allow the model to distinguish signal from noise with higher confidence.',
        'There is no target. The daemon reads indefinitely.',
      ],
    },
  } as Record<ScoreSheetKey, ScoreSheetEntry>,

  // ── Layer 4 — Fragment Context Lines ─────────────────────────────────────
  // Mono green line shown for FRAGMENT_CONTEXT_MS before each new fragment type.
  fragmentContext: {
    reaction_test:   'tap the word if it stays with you.',
    weighted_scale:  'position yourself between the two.',
    prediction_duel: "what do you think you'll do?",
    speed_round:     'finish the sentence. first instinct.',
    trap:            'one option is better. choose.',
  } as Record<string, string>,

  // ── The Trap ──────────────────────────────────────────────────────────────
  trap: {
    onTable:  'ON THE TABLE',  // odds: stake ledger label
    sunk:     'SUNK',          // sunk: locked-meter label
    logged:   'logged.',       // the silent commit beat — never a verdict
    // overconfidence: the pre-session estimate slider
    estimateUnit:    'fragments',
    estimateLow:     'a few',
    estimateHigh:    'all of it',
    estimateConfirm: 'lock it in',
    estimateAria:    'how far you expect to get',
  },

  // ── Layer 3 — daemon.log Codex ────────────────────────────────────────────
  // Terminal-styled reference entries. Accessible via Settings → daemon.log.
  codex: [
    {
      key: 'kernel_access',
      lines: [
        'depth of model penetration.',
        'range: 0–100%. ceiling never reached.',
        'rises: with consistent, coherent behavioral signal.',
        'falls: it does not fall. only the rate of rise slows.',
      ],
    },
    {
      key: 'daemon_accuracy',
      lines: [
        'prediction accuracy against your own behavior.',
        'range: 0–100%.',
        'rises: when prediction duel results confirm the model.',
        'falls: when you contradict the model consistently.',
        'note: a fall may indicate authentic change.',
      ],
    },
    {
      key: 'decoded_lines',
      lines: [
        'cumulative volume of behavioral signal collected.',
        'no target. no ceiling. increases with every session.',
      ],
    },
    {
      key: 'fragment',
      lines: [
        'a single behavioral probe within a session.',
        'types: reaction_test, weighted_scale, prediction_duel.',
        'the daemon reads your response, not your intention.',
      ],
    },
    {
      key: 'process',
      lines: [
        'a behavioral pattern the daemon has identified and named.',
        'names emerge from your data, not from a template.',
        'strength rises if the pattern persists. fades if it resolves.',
        'states: new → running → sleeping → weakening.',
      ],
    },
    {
      key: 'shadow_prompt',
      lines: [
        'one question derived from session observations.',
        'not answered in the app. carried into daily life.',
        'the daemon may return to it tomorrow.',
      ],
    },
    {
      key: 'compile',
      lines: [
        'the nightly event. the analyst reads your sessions.',
        'the narrator converts the read into audio and prose.',
        'you receive what the daemon concluded while you slept.',
      ],
    },
    {
      key: 'orb_states',
      lines: [
        'cold:    first impression formed. model is early.',
        'warming: patterns emerging. signal-to-noise improving.',
        'running: behavioral baseline established. deviations trackable.',
        'deep:    high-confidence model. certainty is earned, not assumed.',
      ],
    },
    {
      key: 'behavioral_index',
      lines: [
        'the three scores together: kernel access, daemon accuracy,',
        "decoded lines. a composite read of the daemon's current depth,",
        'accuracy, and data volume. no single number summarizes you.',
      ],
    },
  ] as readonly CodexEntry[],
}
