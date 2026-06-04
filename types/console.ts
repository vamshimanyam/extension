export type ConsoleLevel = 'log' | 'warn' | 'error' | 'info' | 'debug'

export interface ConsoleEntry {
  id: string
  level: ConsoleLevel
  message: string
  fullMessage: string
  source: string
  timestamp: string
  tabId: number
}
