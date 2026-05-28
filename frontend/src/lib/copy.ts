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
}
