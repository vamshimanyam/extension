export const COMMANDS = {
  captureSilent: 'capture-silent',
  captureNote: 'capture-note',
  captureTech: 'capture-tech',
  captureRegion: 'capture-region',
} as const

export type CaptureCommand =
  | typeof COMMANDS.captureSilent
  | typeof COMMANDS.captureNote
  | typeof COMMANDS.captureTech
  | typeof COMMANDS.captureRegion
