import type { Settings } from '../types/settings'

export const DB_NAME = 'qa-extension'
export const DB_VERSION = 1

export const SETTINGS_KEY = 'singleton'
export const ACTIVE_SESSION_STORAGE_KEY = 'activeSessionId'

export const BUFFER_LIMITS = {
  min: 10,
  max: 50,
  default: 20,
} as const

export const CAPTURE_LIMITS = {
  qualityMin: 60,
  qualityMax: 100,
  qualityDefault: 85,
  warningQuotaPercent: 75,
  criticalQuotaPercent: 90,
} as const

export const DEFAULT_SETTINGS: Settings = {
  hotkeys: {
    silent: 'Ctrl+Shift+S',
    note: 'Ctrl+Shift+N',
    tech: 'Ctrl+Shift+D',
    region: 'Ctrl+Shift+R',
  },
  capture: {
    format: 'webp',
    quality: CAPTURE_LIMITS.qualityDefault,
    regionModeDefault: 'silent',
  },
  buffers: {
    networkMax: BUFFER_LIMITS.default,
    consoleMax: BUFFER_LIMITS.default,
  },
  session: {
    autoNameFormat: 'Session - {date} {time}',
    defaultEnvironment: '',
    defaultTesterName: '',
  },
  export: {
    defaultFormat: 'docx',
    includePassSteps: true,
    includeScreenshots: true,
    includeSummaryTable: true,
    includeTimestamps: true,
    includeUrls: true,
    includeTechData: true,
    pageSize: 'A4',
    reportTemplate: 'standard',
  },
  smartCapture: {
    autoCaptureConsoleErrors: false,
    autoCaptureNavigation: false,
  },
  integrations: {
    jiraBaseUrl: '',
    jiraProjectKey: '',
    slackChannel: '',
  },
  ui: {
    theme: 'dark',
    timelineLayout: 'vertical',
    thumbnailSize: 'medium',
  },
}
