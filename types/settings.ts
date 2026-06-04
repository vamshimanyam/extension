export interface Settings {
  hotkeys: {
    silent: string
    note: string
    tech: string
    region: string
  }
  capture: {
    format: 'webp' | 'png'
    quality: number
    regionModeDefault: 'silent' | 'ask'
  }
  buffers: {
    networkMax: number
    consoleMax: number
  }
  session: {
    autoNameFormat: string
    defaultEnvironment: string
    defaultTesterName: string
  }
  export: {
    defaultFormat: 'docx' | 'pdf'
    includePassSteps: boolean
    includeScreenshots: boolean
    includeSummaryTable: boolean
    includeTimestamps: boolean
    includeUrls: boolean
    includeTechData: boolean
    pageSize: 'A4' | 'Letter'
    reportTemplate: 'standard' | 'bug-report' | 'handoff'
  }
  smartCapture: {
    autoCaptureConsoleErrors: boolean
    autoCaptureNavigation: boolean
  }
  integrations: {
    jiraBaseUrl: string
    jiraProjectKey: string
    slackChannel: string
  }
  ui: {
    theme: 'light' | 'dark' | 'system'
    timelineLayout: 'vertical' | 'grid'
    thumbnailSize: 'small' | 'medium' | 'large'
  }
}

export interface SettingsUpdate {
  hotkeys?: Partial<Settings['hotkeys']>
  capture?: Partial<Settings['capture']>
  buffers?: Partial<Settings['buffers']>
  session?: Partial<Settings['session']>
  export?: Partial<Settings['export']>
  smartCapture?: Partial<Settings['smartCapture']>
  integrations?: Partial<Settings['integrations']>
  ui?: Partial<Settings['ui']>
}
