export const copy = {
  compile: {
    lines: (signals: number, analystTime: string): string[] => [
      '> compiling daemon_profile...',
      `> processing ${signals} behavioral signals`,
      `> analyst complete [${analystTime}]`,
    ],
    complete: 'compile complete',
  },
  processLog: {
    unnamedExpanded: 'The daemon is watching this. Come back tomorrow.',
    stillForming:    'still forming',
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
    // 8 prompts for the Speed Round (onboarding-only)
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
}
